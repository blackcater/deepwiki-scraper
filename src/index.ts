import { join } from 'node:path'

import { shutdownManager } from 'bunqueue/client'

import { launchBrowser, closeBrowser } from './browser'
import { loadConfig, parseRepo } from './config'
import { createQueue, createWorker } from './queue'
import type { Task } from './queue'
import { scrapeNavTree, scrapePage, savePage, titleToSlug } from './scraper'
import type { NavNode, ScrapePageResult, ScrapeRepoResult } from './types'

interface TaskWithPath {
	filePath: string
}

async function scrapeRepo(repo: string): Promise<ScrapeRepoResult> {
	const config = loadConfig()
	const { owner, name } = parseRepo(repo)
	const repoSlug = `${owner}_${name}`
	const outputBase = join(config.outputDir, repoSlug)

	const browser = await launchBrowser(config)

	// Step 1: Extract navigation tree from sidebar
	const navTree: NavNode[] = await scrapeNavTree(browser, owner, name, config)

	// Step 2: Build task list from nav tree
	const { tasks, taskMap } = buildTaskList(navTree, config.nameFormat)

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

	worker.on('completed', async (_job, result) => {
		const page = result as ScrapePageResult
		pages.push(page)

		const taskInfo = taskMap.get(page.url)
		if (taskInfo && page.content) {
			const filePath = join(outputBase, taskInfo.filePath)
			await savePage(page.content, filePath)
			console.log(`Saved: ${filePath}`)
		}
	})

	worker.on('failed', (_job, error) => {
		console.error(`Job failed: ${error.message}`)
	})

	// Add all tasks to queue
	for (const task of tasks) {
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

function buildTaskList(
	nodes: NavNode[],
	nameFormat: string
): { tasks: Task[]; taskMap: Map<string, TaskWithPath> } {
	const tasks: Task[] = []
	const taskMap = new Map<string, TaskWithPath>()

	function traverse(node: NavNode, parentSlugs: string[]) {
		const slug = titleToSlug(
			node.title,
			nameFormat as
				| 'kebab-case'
				| 'snake_case'
				| 'camelCase'
				| 'PascalCase'
		)
		const currentSlugs = [...parentSlugs, slug]
		const isLeaf = !node.children || node.children.length === 0

		// Determine file path
		let filePath: string
		if (isLeaf) {
			// Leaf node: my-project/my-doc.md
			filePath = [...currentSlugs.slice(0, -1), `${slug}.md`].join('/')
		} else {
			// Has children: my-project/index.md
			filePath = [...currentSlugs, 'index.md'].join('/')
		}

		const task: Task = {
			url: node.url,
			depth: parentSlugs.length,
			isLeaf,
			filePath,
		}
		tasks.push(task)
		taskMap.set(node.url, { filePath })

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
