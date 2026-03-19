import type { Browser, Page } from 'puppeteer'

import type { Config, NavNode, ScrapePageResult } from './types'

const PADDING_PER_LEVEL = 12

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
): Promise<NavNode[]> {
	const page = await browser.newPage()
	try {
		const baseUrl = `${config.baseUrl}/${owner}/${name}`
		await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 })
		return await extractNavTree(page)
	} finally {
		await page.close()
	}
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
				}
				break
			}
		}

		return { url, title, content }
	} finally {
		await page.close()
	}
}
