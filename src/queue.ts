import { Queue, Worker } from 'bunqueue/client'

import type { ScrapeResult } from './types'

export interface Task {
	url: string
	depth: number
	isLeaf: boolean
	filePath: string
}

export interface ScrapeJobData {
	url: string
	depth: number
	isLeaf: boolean
	filePath: string
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
