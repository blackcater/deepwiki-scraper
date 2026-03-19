import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

import type { Config } from './types'

puppeteer.use(stealth())

export async function launchBrowser(config: Config): Promise<Browser> {
	return puppeteer.launch({
		headless: config.headless,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--disable-accelerated-2d-canvas',
			'--disable-gpu',
		],
	})
}

export async function createPage(browser: Browser): Promise<Page> {
	return browser.newPage()
}

export async function closeBrowser(browser: Browser): Promise<void> {
	await browser.close()
}
