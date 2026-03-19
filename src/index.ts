import { shutdownManager } from 'bunqueue/client'

import { launchBrowser, closeBrowser } from './browser'
import { loadConfig, parseRepo } from './config'
import { createQueue, createWorker } from './queue'
import type { Task } from './queue'
import { scrapeNavTree, scrapePage } from './scraper'
import type { NavNode, ScrapePageResult, ScrapeRepoResult } from './types'

async function scrapeRepo(repo: string): Promise<ScrapeRepoResult> {
	const config = loadConfig()
	const { owner, name } = parseRepo(repo)

	const browser = await launchBrowser(config)

	// Step 1: Extract navigation tree from sidebar
	const navTree: NavNode[] = await scrapeNavTree(browser, owner, name, config)

	// Step 2: Build task list from nav tree
	const tasks: Task[] = buildTaskList(navTree)

	// Step 3: Create queue and worker
	const queue = createQueue()
	const pages: ScrapePageResult[] = []

	const worker = createWorker(
		config.maxConcurrency,
		config.delayMs,
		async (data) => {
			return scrapePage(browser, data.url)
		}
	)

	worker.on('completed', (_job, result) => {
		pages.push(result as ScrapePageResult)
	})

	worker.on('failed', (_job, error) => {
		console.error(`Job failed: ${error.message}`)
	})

	// Add all tasks to queue (debug: limit to 1 task)
	for (const task of tasks.slice(0, 1)) {
		await queue.add('scrape', task)
	}

	// Wait for all jobs to complete
	await new Promise<void>((resolve) => {
		worker.on('drained', () => {
			resolve()
		})
	})

	await worker.close()
	shutdownManager()
	await closeBrowser(browser)

	return { owner, name, pages }
}

function buildTaskList(nodes: NavNode[]): Task[] {
	const tasks: Task[] = []
	for (const node of nodes) {
		tasks.push({ url: node.url, depth: 0 })
		if (node.children) {
			tasks.push(...buildTaskList(node.children))
		}
	}
	return tasks
}

async function main() {
	const args = Bun.argv.slice(2)
	const repo = args[0]

	if (!repo) {
		console.error('Usage: bun dev <owner/repo>')
		process.exit(1)
	}

	if (!repo.includes('/')) {
		console.error('Invalid repo format. Expected: owner/repo')
		process.exit(1)
	}

	console.log(`Starting DeepWiki scraper for ${repo}`)

	const config = loadConfig()
	console.log(`Loaded config from scraper.yaml`)
	console.log(`Output directory: ${config.outputDir}`)
	console.log(`Max concurrency: ${config.maxConcurrency}`)

	const result: ScrapeRepoResult = await scrapeRepo(repo)
	console.log(`Scraped ${result.pages.length} pages`)
	console.log('Scraping complete!')
}

main().catch((err) => {
	console.error('Error:', err)
	process.exit(1)
})
