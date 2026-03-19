# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev openclaw/openclaw   # Run scraper for a repo
bun test                    # Run tests
bunx oxlint                 # Lint code
bunx oxfmt                  # Format code
npx tsc --noEmit           # Type check
```

## Architecture

**DeepWiki Scraper** - A CLI tool that scrapes documentation from deepwiki.com using puppeteer-extra and bunqueue.

### Flow
1. Parse `owner/repo` argument and load `scraper.yaml` config
2. Launch browser via puppeteer-extra with stealth plugin
3. Navigate to DeepWiki page and extract sidebar navigation tree
4. Flatten tree into tasks, add to bunqueue Queue
5. Worker processes tasks with concurrency control
6. Results aggregated and returned as `ScrapeRepoResult`

### Key Files
- `src/index.ts` - Entry point, orchestrates scrape flow, manages browser/queue/worker lifecycle
- `src/scraper.ts` - Pure scraping functions: `extractNavTree`, `scrapePage`, `scrapeNavTree`
- `src/queue.ts` - bunqueue Queue and Worker setup
- `src/browser.ts` - puppeteer-extra browser management
- `src/config.ts` - `loadConfig()` from YAML, `parseRepo()` helper
- `src/types.ts` - `Config`, `NavNode`, `ScrapePageResult`, `ScrapeRepoResult`

### Configuration
`scraper.yaml` contains: `outputDir`, `maxConcurrency`, `delayMs`, `baseUrl`, `headless`

### Dependencies
- **puppeteer-extra** + **stealth** - Headless browser automation
- **bunqueue** - Job queue with SQLite persistence (embedded mode)
- **yaml** - Config file parsing
