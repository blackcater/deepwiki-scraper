import { join } from 'node:path'

import { shutdownManager } from 'bunqueue/client'
import Table from 'cli-table3'
import { Command } from 'commander'
import type { Browser } from 'puppeteer'

import { launchBrowser, closeBrowser } from './browser'
import { loadConfig, parseRepo } from './config'
import {
	createNavTreeQueue,
	createPageQueue,
	createNavTreeWorker,
	createPageWorker,
	type NavTreeResult,
} from './queue'
import { scrapeNavTree, scrapePage, savePage, buildTaskList } from './scraper'
import type { RepoResult, ScrapePageResult } from './types'

interface PageOptions {
	page?: string
}

async function scrapeSinglePage(
	browser: Browser,
	url: string,
	outputDir: string
): Promise<void> {
	const result = await scrapePage(browser, url)

	if (!result.content) {
		throw new Error(`Failed to scrape page: ${url}`)
	}

	// Extract page name from URL path
	// URL format: https://deepwiki.com/owner/repo/page-name
	const urlObj = new URL(url)
	const pathParts = urlObj.pathname.split('/').filter(Boolean)
	// Remove owner/repo prefix, get the last part as page name
	const pageName = pathParts.slice(2).join('/') || 'index'
	const outputPath = join(outputDir, 'pages', `${pageName}.md`)

	await savePage(result.content, outputPath)
	console.log(`Saved: ${outputPath}`)
}

async function scrapeRepos(repos: string[]): Promise<RepoResult[]> {
	const config = loadConfig()
	const browser = await launchBrowser(config)

	const navTreeQueue = createNavTreeQueue()
	const pageQueue = createPageQueue()

	const repoResults: RepoResult[] = []
	const allTaskMaps = new Map<string, Map<string, { filePath: string }>>()
	const allOutputBases = new Map<string, string>()
	const pendingPages = new Map<string, { success: number; failure: number }>()

	// Create nav tree worker (concurrency=1 for sequential nav tree scraping)
	const navTreeWorker = createNavTreeWorker(
		config.navTreeConcurrency,
		async (job) => {
			return scrapeNavTree(
				browser,
				job.data.repoOwner,
				job.data.repoName,
				config
			)
		}
	)

	// Create page worker (configurable concurrency)
	const pageWorker = createPageWorker(
		config.maxConcurrency,
		config.delayMs,
		async (job) => {
			return scrapePage(browser, job.data.url)
		}
	)

	// Track pending page jobs count
	let pendingPageJobs = 0
	let pendingPageResolve: (() => void) | null = null

	// Process nav tree results and add page jobs
	navTreeWorker.on('completed', async (job, result) => {
		const { owner, name, navTree } = result as NavTreeResult
		const repoSlug = `${owner}_${name}`
		const outputBase = join(config.outputDir, repoSlug)

		allOutputBases.set(repoSlug, outputBase)
		pendingPages.set(repoSlug, { success: 0, failure: 0 })

		// Build task list and add to page queue
		const { tasks, taskMap } = buildTaskList(
			navTree,
			repoSlug,
			config.nameFormat as
				| 'kebab-case'
				| 'snake_case'
				| 'camelCase'
				| 'PascalCase'
		)

		// Store task map for later use
		allTaskMaps.set(repoSlug, taskMap as Map<string, { filePath: string }>)

		// Add page jobs to queue
		pendingPageJobs += tasks.length
		for (const task of tasks) {
			await pageQueue.add(
				'scrape',
				{
					url: task.url,
					depth: task.depth,
					isLeaf: task.isLeaf,
					filePath: task.filePath,
					repoSlug,
				},
				{
					attempts: config.retryAttempts,
					backoff: config.retryDelay,
				}
			)
		}
	})

	// Track page completion - single consolidated handler
	pageWorker.on('completed', async (job, result) => {
		const page = result as ScrapePageResult
		const repoSlug = job.data.repoSlug
		const taskInfo = allTaskMaps.get(repoSlug)?.get(page.url)
		const outputBase = allOutputBases.get(repoSlug)

		if (taskInfo && outputBase && page.content) {
			const filePath = join(outputBase, taskInfo.filePath)
			await savePage(page.content, filePath)
			console.log(`Saved: ${filePath}`)
		}

		// Update counts
		const counts = pendingPages.get(repoSlug)
		if (counts) {
			counts.success++
		}

		// Decrement pending counter and resolve if done
		pendingPageJobs--
		if (pendingPageJobs === 0 && pendingPageResolve) {
			pendingPageResolve()
		}
	})

	pageWorker.on('failed', (job, error) => {
		console.error(`Job failed: ${error.message}`)
		const repoSlug = job.data.repoSlug
		const counts = pendingPages.get(repoSlug)
		if (counts) {
			counts.failure++
		}

		pendingPageJobs--
		if (pendingPageJobs === 0 && pendingPageResolve) {
			pendingPageResolve()
		}
	})

	// Wait for all queues to be ready
	await navTreeQueue.waitUntilReady()
	await navTreeWorker.waitUntilReady()
	await pageQueue.waitUntilReady()
	await pageWorker.waitUntilReady()

	// Add nav tree jobs for all repos
	for (const repo of repos) {
		const { owner, name } = parseRepo(repo)
		await navTreeQueue.add('nav-tree', { repoOwner: owner, repoName: name })
	}

	// Wait for all nav tree jobs to complete
	await new Promise<void>((resolve) => {
		navTreeWorker.on('drained', () => {
			resolve()
		})
	})

	// Wait for all page jobs to complete
	await new Promise<void>((resolve) => {
		pendingPageResolve = resolve
		// If no jobs were added, resolve immediately
		if (pendingPageJobs === 0) {
			resolve()
		}
	})

	// Build results
	for (const repo of repos) {
		const { owner, name } = parseRepo(repo)
		const repoSlug = `${owner}_${name}`
		const counts = pendingPages.get(repoSlug) || { success: 0, failure: 0 }
		repoResults.push({
			owner,
			name,
			totalPages: counts.success + counts.failure,
			successCount: counts.success,
			failureCount: counts.failure,
		})
	}

	await navTreeWorker.close()
	await pageWorker.close()
	shutdownManager()
	await closeBrowser(browser)

	return repoResults
}

function printSummary(results: RepoResult[]) {
	const table = new Table({
		head: ['Repo', 'Total Pages', 'Success', 'Failed'],
		colWidths: [30, 15, 15, 15],
	})

	for (const result of results) {
		const status = result.error ? '❌' : '✅'
		table.push([
			`${status} ${result.owner}/${result.name}`,
			result.totalPages.toString(),
			result.successCount.toString(),
			result.failureCount.toString(),
		])
	}

	console.log('\n' + table.toString())
}

async function main() {
	const program = new Command()

	program
		.name('deepwiki-scraper')
		.description('Scrape documentation from deepwiki.com')
		.version('1.0.0')

	program
		.command('scrape')
		.description('Scrape repos or single pages from deepwiki.com')
		.arguments('<repos...>')
		.option(
			'-p, --page <url>',
			'Scrape a single page from the specified URL'
		)
		.action(async (repos: string[], options: PageOptions) => {
			if (repos.length === 0) {
				console.error('Error: at least one repo is required')
				program.error('', { exitCode: 1 })
			}

			for (const repo of repos) {
				if (!repo.includes('/')) {
					console.error(
						`Invalid repo format: ${repo}. Expected: owner/repo`
					)
					program.error('', { exitCode: 1 })
				}
			}

			const config = loadConfig()

			if (options.page) {
				// Single page mode
				console.log(`Loaded config from scraper.yaml`)
				console.log(`Output directory: ${config.outputDir}`)
				console.log(`Scraping single page: ${options.page}\n`)

				const browser = await launchBrowser(config)
				try {
					await scrapeSinglePage(
						browser,
						options.page,
						config.outputDir
					)
					console.log('\nScraping complete!')
				} finally {
					shutdownManager()
					await closeBrowser(browser)
				}
			} else {
				// Full repo mode
				console.log(`Loaded config from scraper.yaml`)
				console.log(`Output directory: ${config.outputDir}`)
				console.log(`Max concurrency: ${config.maxConcurrency}`)
				console.log(
					`Nav tree concurrency: ${config.navTreeConcurrency}`
				)
				console.log(
					`Scraping ${repos.length} repo(s): ${repos.join(', ')}\n`
				)

				const results = await scrapeRepos(repos)
				printSummary(results)
				console.log('Scraping complete!')
			}
		})

	// Handle default command (backward compatibility for `bun dev owner/repo`)
	// Only activate when no recognized command is given
	const hasCommand = Bun.argv
		.slice(2)
		.some(
			(arg) =>
				arg === 'scrape' ||
				arg === 'help' ||
				arg === '--help' ||
				arg === '-h'
		)
	if (!hasCommand) {
		const repos = Bun.argv.slice(2).filter((arg) => !arg.startsWith('-'))
		const pageIndex = Bun.argv.indexOf('--page')
		const page = pageIndex !== -1 ? Bun.argv[pageIndex + 1] : undefined

		if (repos.length > 0) {
			if (page) {
				const config = loadConfig()
				console.log(`Loaded config from scraper.yaml`)
				console.log(`Output directory: ${config.outputDir}`)
				console.log(`Scraping single page: ${page}\n`)

				const browser = await launchBrowser(config)
				try {
					await scrapeSinglePage(browser, page, config.outputDir)
					console.log('\nScraping complete!')
				} finally {
					shutdownManager()
					await closeBrowser(browser)
				}
			} else {
				const config = loadConfig()
				console.log(`Loaded config from scraper.yaml`)
				console.log(`Output directory: ${config.outputDir}`)
				console.log(`Max concurrency: ${config.maxConcurrency}`)
				console.log(
					`Nav tree concurrency: ${config.navTreeConcurrency}`
				)
				console.log(
					`Scraping ${repos.length} repo(s): ${repos.join(', ')}\n`
				)

				const results = await scrapeRepos(repos)
				printSummary(results)
				console.log('Scraping complete!')
			}
			return
		}
	}

	program.parse()
}

main().catch((err) => {
	console.error('Error:', err)
	process.exit(1)
})
