import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import yaml from 'yaml'

import type { Config } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadConfig(): Config {
	const configPath = resolve(__dirname, '../scraper.yaml')
	const file = readFileSync(configPath, 'utf-8')
	return yaml.parse(file) as Config
}

export function parseRepo(repo: string): { owner: string; name: string } {
	const [owner, name] = repo.split('/')
	if (!owner || !name) {
		throw new Error(`Invalid repo format: ${repo}. Expected: owner/repo`)
	}
	return { owner, name }
}
