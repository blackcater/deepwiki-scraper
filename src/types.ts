export interface Config {
	outputDir: string
	maxConcurrency: number
	delayMs: number
	baseUrl: string
	headless: boolean
}

export interface NavNode {
	title: string
	url: string
	children?: NavNode[]
}

export interface ScrapeResult {
	url: string
	title: string
	content?: string
	children?: NavNode[]
	error?: string
}

export interface ScrapePageResult {
	url: string
	title: string
	content?: string
}

export interface ScrapeRepoResult {
	owner: string
	name: string
	pages: ScrapePageResult[]
	error?: string
}
