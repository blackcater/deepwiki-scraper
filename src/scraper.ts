import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Browser, Page } from 'puppeteer'

import type { Config, NameFormat, NavNode, ScrapePageResult } from './types'

const PADDING_PER_LEVEL = 12

export function titleToSlug(title: string, format: NameFormat): string {
	// Preprocess: replace & with ' and ' before splitting
	const processed = title.replace(/&/g, ' and ')
	const words = processed.split(/\s+/)

	const separator =
		format === 'kebab-case' ? '-' : format === 'snake_case' ? '_' : null

	if (separator) {
		// kebab-case or snake_case: lowercase all, replace hyphens with separator, keep colons, @ and parentheses
		return words
			.map((w) => {
				// Remove non-alphanumeric chars except @, colons, hyphens, underscores and parentheses
				const cleaned = w.replace(/[^a-zA-Z0-9@:()_-]/g, '')
				// Replace hyphens with separator
				return cleaned.replace(/-/g, separator).toLowerCase()
			})
			.join(separator)
	}

	// camelCase or PascalCase
	// Split by spaces AND hyphens to properly handle word boundaries
	return processed
		.split(/[\s\-]+/)
		.map((w, i) => {
			// Remove non-alphanumeric chars except @, colons, parentheses, and /
			// Keep / so we can split @tanstack/ai into @tanstack and ai
			const cleaned = w.replace(/[^a-zA-Z0-9@:()/]/g, '')
			const firstChar = cleaned.charAt(0)
			const isNonAlphanumericStart = !/[a-zA-Z0-9]/.test(firstChar)

			if (isNonAlphanumericStart) {
				// e.g., '(Nodes)' or ':LLM' or '@tanstack/ai' - preserve prefix, split on / if present
				// First, find where the alphanumeric part starts
				const match = cleaned.match(/[a-zA-Z0-9]/)
				if (!match) return cleaned.toLowerCase()
				const idx = match.index ?? 0
				const prefix = cleaned.slice(0, idx)

				// Split rest by / to handle @tanstack/ai -> @tanstack and ai
				const rest = cleaned.slice(idx)
				const parts = rest.split('/')
				const titleCased = parts
					.map(
						(p) =>
							p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
					)
					.join('')
				return prefix + titleCased
			}

			// Normal word
			const firstAlphanumeric = cleaned.charAt(0)
			const rest = cleaned.slice(1)

			if (i === 0) {
				// First word: all lowercase for camelCase, capitalize first letter for PascalCase
				return format === 'PascalCase'
					? firstAlphanumeric.toUpperCase() + rest.toLowerCase()
					: firstAlphanumeric.toLowerCase() + rest.toLowerCase()
			}

			// Non-first words: capitalize first letter, lowercase the rest
			return firstAlphanumeric.toUpperCase() + rest.toLowerCase()
		})
		.join('')
}

export async function savePage(
	content: string,
	outputPath: string
): Promise<void> {
	await mkdir(dirname(outputPath), { recursive: true })
	await writeFile(outputPath, content, 'utf-8')
}

async function extractNavTree(page: Page): Promise<NavNode[]> {
	const navTree: NavNode[] = []

	interface NavItem {
		paddingLeft: number
		href: string
		title: string
	}

	const navItems: NavItem[] = await page.$$eval(
		'ul.flex-1:nth-child(2) > li',
		(liElements) =>
			liElements.map((li) => {
				const a = li.querySelector('a')
				const paddingLeft = Number.parseInt(
					li.style.paddingLeft || '0',
					10
				)
				return {
					paddingLeft,
					href: a?.href || '',
					title: a?.textContent?.trim() || '',
				}
			})
	)

	if (navItems.length === 0) {
		return []
	}

	const stack: NavNode[] = []

	for (const item of navItems) {
		const depth = item.paddingLeft / PADDING_PER_LEVEL
		const node: NavNode = {
			title: item.title,
			url: item.href,
		}

		while (stack.length > depth) {
			stack.pop()
		}

		if (depth === 0) {
			navTree.push(node)
		} else {
			const parent = stack.at(-1)
			if (parent) {
				parent.children = parent.children || []
				parent.children.push(node)
			}
		}

		stack.push(node)
	}
	return navTree
}

export async function scrapeNavTree(
	browser: Browser,
	owner: string,
	name: string,
	config: Config
): Promise<{ owner: string; name: string; navTree: NavNode[] }> {
	const page = await browser.newPage()
	try {
		const baseUrl = `${config.baseUrl}/${owner}/${name}`
		await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 })
		const navTree = await extractNavTree(page)
		return { owner, name, navTree }
	} finally {
		await page.close()
	}
}

export interface TaskListResult {
	tasks: Task[]
	taskMap: Map<string, Task>
}

export interface Task {
	url: string
	depth: number
	isLeaf: boolean
	filePath: string
}

export function buildTaskList(
	nodes: NavNode[],
	repoSlug: string,
	nameFormat: NameFormat
): TaskListResult {
	const tasks: Task[] = []
	const taskMap = new Map<string, Task>()

	function traverse(node: NavNode, parentSlugs: string[]) {
		const slug = titleToSlug(node.title, nameFormat)
		const currentSlugs = [...parentSlugs, slug]
		const isLeaf = !node.children || node.children.length === 0

		let filePath: string
		if (isLeaf) {
			filePath = [...currentSlugs.slice(0, -1), `${slug}.md`].join('/')
		} else {
			filePath = [...currentSlugs, 'index.md'].join('/')
		}

		const task: Task = {
			url: node.url,
			depth: parentSlugs.length,
			isLeaf,
			filePath,
		}
		tasks.push(task)
		taskMap.set(node.url, task)

		if (node.children) {
			for (const child of node.children) {
				traverse(child, currentSlugs)
			}
		}
	}

	for (const node of nodes) {
		traverse(node, [])
	}

	return { tasks, taskMap }
}

export async function scrapePage(
	browser: Browser,
	url: string
): Promise<ScrapePageResult> {
	const page = await browser.newPage()
	try {
		await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })

		// Extract title from h1 tag
		const title = await page.$eval(
			'h1',
			(el) => el.textContent?.trim() || ''
		)

		// Find all scripts and locate the one with markdown content
		interface ScriptContent {
			text: string
		}

		const scripts: ScriptContent[] = await page.$$eval(
			'script',
			(elements) => elements.map((el) => ({ text: el.textContent || '' }))
		)

		let content = ''
		for (const script of scripts) {
			const stripTitle = title.replace(/&/g, '\\u0026')
			const pattern = `self.__next_f.push([1,"# ${stripTitle}`
			if (script.text.startsWith(pattern)) {
				const match = script.text.match(
					/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/
				)
				if (match && match[1]) {
					content = match[1]
						.replace(/\\n/g, '\n')
						.replace(/\\"/g, '"')
						.replace(/\\\\/g, '\\')
						.replace(/\\u003c/g, '<')
						.replace(/\\u003e/g, '>')
						.replace(/\\u0026/g, '&')
						.replace(/\\u0027/g, "'")
						.replace(/\\u0022/g, '"')
						.replace(/\\u003d/g, '=')
						.replace(/\\u0060/g, '`')
				}
				break
			}
		}

		return { url, title, content }
	} finally {
		await page.close()
	}
}
