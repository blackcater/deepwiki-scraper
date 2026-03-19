export type NameFormat =
	| 'kebab-case'
	| 'snake_case'
	| 'camelCase'
	| 'PascalCase'

export interface Config {
	outputDir: string
	maxConcurrency: number
	delayMs: number
	baseUrl: string
	headless: boolean
	nameFormat: NameFormat
	retryAttempts: number
	retryDelay: number
	navTreeConcurrency: number
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

export interface NavTreeJobData {
	repoOwner: string
	repoName: string
}

export interface PageJobData {
	url: string
	depth: number
	isLeaf: boolean
	filePath: string
	repoSlug: string
}

export interface RepoResult {
	owner: string
	name: string
	totalPages: number
	successCount: number
	failureCount: number
	error?: string
}
