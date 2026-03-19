import { Queue, Worker } from 'bunqueue/client'

import type { ScrapeResult } from './types'

export interface Task {
	url: string
	depth: number
}

export interface ScrapeJobData {
	url: string
	depth: number
}

export function createQueue() {
	return new Queue<ScrapeJobData>('scrape-tasks', { embedded: true })
}

export function createWorker(
	concurrency: number,
	delayMs: number,
	processor: (data: ScrapeJobData) => Promise<ScrapeResult>
) {
	return new Worker<ScrapeJobData>(
		'scrape-tasks',
		async (job) => {
			const result = await processor(job.data)
			// Rate limiting delay between tasks
			if (delayMs > 0) {
				await Bun.sleep(delayMs)
			}
			return result
		},
		{
			embedded: true,
			concurrency,
		}
	)
}

// TODO: Aggregate results from all tasks
export function aggregateResults(_results: ScrapeResult[]): void {
	// 1. Group by category/section
	// 2. Sort by URL/path
	// 3. Generate summary report
}

// TODO: Display progress to user
export function displayProgress(completed: number, total: number): void {
	console.log(`Progress: ${completed}/${total} pages scraped`)
}
