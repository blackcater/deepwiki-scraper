import { Queue, Worker } from 'bunqueue/client'
import type { Job } from 'bunqueue/client'

import type {
	NavTreeJobData,
	NavNode,
	PageJobData,
	ScrapePageResult,
} from './types'

export interface Task {
	url: string
	depth: number
	isLeaf: boolean
	filePath: string
}

export interface NavTreeResult {
	owner: string
	name: string
	navTree: NavNode[]
}

export function createNavTreeQueue() {
	return new Queue<NavTreeJobData>('nav-tree-tasks', { embedded: true })
}

export function createPageQueue() {
	return new Queue<PageJobData>('page-tasks', { embedded: true })
}

export function createNavTreeWorker(
	concurrency: number,
	processor: (job: Job<NavTreeJobData>) => Promise<NavTreeResult>
) {
	return new Worker<NavTreeJobData>(
		'nav-tree-tasks',
		async (job) => {
			return processor(job)
		},
		{
			embedded: true,
			concurrency,
			useLocks: false,
		}
	)
}

export function createPageWorker(
	concurrency: number,
	delayMs: number,
	processor: (job: Job<PageJobData>) => Promise<ScrapePageResult>
) {
	return new Worker<PageJobData>(
		'page-tasks',
		async (job) => {
			const result = await processor(job)
			// Rate limiting delay between tasks
			if (delayMs > 0) {
				await Bun.sleep(delayMs)
			}
			return result
		},
		{
			embedded: true,
			concurrency,
			useLocks: false,
		}
	)
}
