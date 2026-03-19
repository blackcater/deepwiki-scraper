import type { Browser, Page } from 'puppeteer'

import type { Config, NavNode, ScrapePageResult } from './types'

// TODO: Extract sidebar navigation structure from page
export async function extractNavTree(_page: Page): Promise<NavNode[]> {
	// 1. Find sidebar container (specific selectors based on DeepWiki structure)
	// 2. Recursively parse navigation items
	// 3. Build tree structure with titles and URLs
	return []
}

// TODO: Scrape single page content
export async function scrapePage(
	_page: Page,
	_url: string
): Promise<ScrapePageResult> {
	// 1. Navigate to URL
	// 2. Wait for content to load
	// 3. Extract title, body content, any metadata
	// 4. Return structured result
	return { url: _url, title: '' }
}

// TODO: Extract all links from current page
export async function extractLinks(page: Page): Promise<string[]> {
	const links = await page.$$eval('a', (anchors) =>
		anchors.map((a) => a.href).filter((href) => href.includes('/'))
	)
	return links
}

// TODO: Wait for page content to be fully loaded
export async function waitForContent(page: Page): Promise<void> {
	await page.waitForSelector('body', { timeout: 30000 })
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
