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

// TODO: Scrape single page content
export async function scrapePage(
	_browser: Browser,
	_url: string
): Promise<ScrapePageResult> {
	// 1. Navigate to URL
	// 2. Wait for content to load
	// 3. Extract title, body content, any metadata
	// 4. Return structured result
	return { url: _url, title: '' }
}
