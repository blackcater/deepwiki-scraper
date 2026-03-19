import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Browser, Page } from 'puppeteer'

import type { Config, NameFormat, NavNode, ScrapePageResult } from './types'

const PADDING_PER_LEVEL = 12

export function titleToSlug(title: string, format: NameFormat): string {
	const words = title.split(/\s+/)
	switch (format) {
		case 'kebab-case':
			return words
				.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '-'))
				.join('-')
				.replace(/-+/g, '-') // Collapse multiple dashes
		case 'snake_case':
			return words
				.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '_'))
				.join('_')
		case 'camelCase':
			return words
				.map((w, i) => {
					const cleaned = w.replace(/[^a-zA-Z0-9]/g, '')
					return i === 0
						? cleaned.toLowerCase()
						: cleaned.charAt(0).toUpperCase() +
								cleaned.slice(1).toLowerCase()
				})
				.join('')
		case 'PascalCase':
			return words
				.map((w) => {
					const cleaned = w.replace(/[^a-zA-Z0-9]/g, '')
					return (
						cleaned.charAt(0).toUpperCase() +
						cleaned.slice(1).toLowerCase()
					)
				})
				.join('')
	}
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
			const pattern = `self.__next_f.push([1,"# ${title}`
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
