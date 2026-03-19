# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev openclaw/openclaw   # Scrape a repo (owner/repo format)
bun test                    # Run tests
bunx oxlint                 # Lint code
bunx oxfmt                  # Format code
npx tsc --noEmit           # Type check
```

## Architecture

**DeepWiki Scraper** - CLI tool that scrapes documentation from deepwiki.com and saves as markdown files.

### Scrape Flow

1. Parse `owner/repo` argument, load `scraper.yaml` config
2. Launch puppeteer-extra browser with stealth plugin
3. Navigate to DeepWiki page, extract sidebar navigation tree (CSS selector: `ul.flex-1:nth-child(2) > li`)
4. Traverse tree, build task list with file paths
5. Add tasks to bunqueue Queue, Worker processes with concurrency control
6. On job completion: save markdown content immediately to file

### Key Files

- `src/index.ts` - Entry point, orchestrates flow, manages browser/queue/worker lifecycle
- `src/scraper.ts` - Pure scraping: `extractNavTree`, `scrapePage`, `titleToSlug`, `savePage`
- `src/queue.ts` - bunqueue Queue and Worker setup
- `src/browser.ts` - puppeteer-extra browser management
- `src/config.ts` - `loadConfig()` from YAML, `parseRepo()` helper
- `src/types.ts` - TypeScript types: `Config`, `NavNode`, `ScrapePageResult`, `ScrapeRepoResult`

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
baseUrl: 'https://deepwiki.com'
nameFormat: kebab-case
```

### Dependencies

- **puppeteer-extra** + **stealth** - Headless browser automation
- **bunqueue** - Job queue with SQLite persistence (embedded mode)
- **yaml** - Config file parsing
