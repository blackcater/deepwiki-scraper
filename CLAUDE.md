# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev <owner/repo> [owner/repo...]  # Scrape one or more repos (owner/repo format)
bun test                            # Run tests
bunx oxlint                         # Lint code
bunx oxfmt                          # Format code
npx tsc --noEmit                   # Type check
```

## Architecture

**DeepWiki Scraper** - CLI tool that scrapes documentation from deepwiki.com and saves as markdown files.

### Scrape Flow

1. Parse multiple `owner/repo` arguments, load `scraper.yaml` config
2. Launch puppeteer-extra browser with stealth plugin
3. For each repo:
   - navTreeQueue (concurrency=1) scrapes navigation tree
   - pageQueue (concurrency=configurable) scrapes individual pages
4. On job completion: save markdown content immediately to file
5. Print summary table with cli-table3

### Key Files

- `src/index.ts` - Entry point, orchestrates flow, manages browser/queues/workers lifecycle
- `src/scraper.ts` - Pure scraping: `extractNavTree`, `scrapeNavTree`, `scrapePage`, `titleToSlug`, `savePage`, `buildTaskList`
- `src/queue.ts` - bunqueue Queue and Worker setup for navTreeQueue and pageQueue
- `src/browser.ts` - puppeteer-extra browser management
- `src/config.ts` - `loadConfig()` from YAML, `parseRepo()` helper
- `src/types.ts` - TypeScript types: `Config`, `NavNode`, `NavTreeJobData`, `PageJobData`, `RepoResult`

### File Naming & Paths

- Output dir: `output/{owner}_{name}/`
- Has children: `{slug}/index.md`
- Leaf nodes: `{parent}/{slug}.md`
- `nameFormat` in config: `kebab-case`, `snake_case`, `camelCase`, `PascalCase`

### Markdown Extraction

- Title from `h1` tag
- Content from `<script>` tag matching pattern: `self.__next_f.push([1,"# {title}...`
- HTML Unicode escapes decoded: `\u003c` → `<`, `\u003e` → `>`, `\u0026` → `&`, etc.

### Configuration (scraper.yaml)

```yaml
outputDir: './output'
maxConcurrency: 3
delayMs: 1000
headless: false
navTreeConcurrency: 1
baseUrl: 'https://deepwiki.com'
nameFormat: kebab-case
retryAttempts: 3
retryDelay: 1000
```

### Dependencies

- **puppeteer-extra** + **stealth** - Headless browser automation
- **bunqueue** - Job queue with SQLite persistence (embedded mode)
- **yaml** - Config file parsing
