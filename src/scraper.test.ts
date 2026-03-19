import { test, expect } from 'bun:test'

import { titleToSlug } from './scraper'

test('titleToSlug converts to kebab-case', () => {
	expect(titleToSlug('Hello World', 'kebab-case')).toBe('hello-world')
	expect(titleToSlug('My API Documentation', 'kebab-case')).toBe(
		'my-api-documentation'
	)
	expect(titleToSlug('JavaScript & TypeScript', 'kebab-case')).toBe(
		'javascript-and-typescript'
	)
	expect(titleToSlug('Native Clients (Nodes)', 'kebab-case')).toBe(
		'native-clients-(nodes)'
	)
	expect(titleToSlug('pi-ai: LLM API Library', 'kebab-case')).toBe(
		'pi-ai:-llm-api-library'
	)
})

test('titleToSlug converts to snake_case', () => {
	expect(titleToSlug('Hello World', 'snake_case')).toBe('hello_world')
	expect(titleToSlug('My API Documentation', 'snake_case')).toBe(
		'my_api_documentation'
	)
	// Non-alphanumeric chars are replaced with underscores, join adds another separator
	expect(titleToSlug('JavaScript & TypeScript', 'snake_case')).toBe(
		'javascript_and_typescript'
	)
	expect(titleToSlug('Native Clients (Nodes)', 'snake_case')).toBe(
		'native_clients_(nodes)'
	)
	expect(titleToSlug('pi-ai: LLM API Library', 'snake_case')).toBe(
		'pi_ai:_llm_api_library'
	)
})

test('titleToSlug converts to camelCase', () => {
	expect(titleToSlug('Hello World', 'camelCase')).toBe('helloWorld')
	expect(titleToSlug('My API Documentation', 'camelCase')).toBe(
		'myApiDocumentation'
	)
	// Non-alphanumeric chars removed, subsequent words capitalized (but lowercased after first char)
	expect(titleToSlug('JavaScript & TypeScript', 'camelCase')).toBe(
		'javascriptAndTypescript'
	)
	expect(titleToSlug('Native Clients (Nodes)', 'camelCase')).toBe(
		'nativeClients(Nodes)'
	)
	expect(titleToSlug('pi-ai: LLM API Library', 'camelCase')).toBe(
		'piAi:LlmApiLibrary'
	)
})

test('titleToSlug converts to PascalCase', () => {
	expect(titleToSlug('Hello World', 'PascalCase')).toBe('HelloWorld')
	expect(titleToSlug('My API Documentation', 'PascalCase')).toBe(
		'MyApiDocumentation'
	)
	// Non-alphanumeric chars removed, first char uppercased, rest lowercased
	expect(titleToSlug('JavaScript & TypeScript', 'PascalCase')).toBe(
		'JavascriptAndTypescript'
	)
	expect(titleToSlug('Native Clients (Nodes)', 'PascalCase')).toBe(
		'NativeClients(Nodes)'
	)
	expect(titleToSlug('pi-ai: LLM API Library', 'PascalCase')).toBe(
		'PiAi:LlmApiLibrary'
	)
})

test('titleToSlug handles single word titles', () => {
	expect(titleToSlug('Introduction', 'kebab-case')).toBe('introduction')
	expect(titleToSlug('Introduction', 'snake_case')).toBe('introduction')
	expect(titleToSlug('Introduction', 'camelCase')).toBe('introduction')
	expect(titleToSlug('Introduction', 'PascalCase')).toBe('Introduction')
})

test('titleToSlug collapses multiple spaces', () => {
	expect(titleToSlug('Hello    World', 'kebab-case')).toBe('hello-world')
	expect(titleToSlug('API  v2  Guide', 'snake_case')).toBe('api_v2_guide')
})
