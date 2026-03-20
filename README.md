# DeepWiki Scraper

A CLI tool that scrapes documentation from [DeepWiki](https://deepwiki.com) and saves it as markdown files.

## Usage

```bash
# scape repo
bun dev scrape openclaw/openclaw

# scape single page
bun dev scrape tanstack/ai --page https://deepwiki.com/TanStack/ai/3.6-additional-capabilities
```

## Configuration

Edit `scraper.yaml`:

```yaml
# Output directory
outputDir: './output'

# Concurrency and rate limiting
maxConcurrency: 3
delayMs: 1000

# Nav tree queue concurrency (1 for sequential nav tree scraping)
navTreeConcurrency: 1

# Browser mode
headless: false

# DeepWiki base URL
baseUrl: 'https://deepwiki.com'

# File naming format: kebab-case, snake_case, camelCase, PascalCase
nameFormat: kebab-case

# Retry settings
retryAttempts: 3
retryDelay: 1000
```

## Output Structure

For `openclaw/openclaw`:

```
output/openclaw_openclaw/
├── overview/
│   ├── index.md           # Section with children
│   ├── getting-started.md # Leaf node
│   └── core-concepts.md
├── gateway/
│   ├── index.md
│   └── websocket-protocol---rpc.md
└── ...
```

## Commands

```bash
bun dev <owner/repo> [owner/repo...]  # Scrape one or more repos
bun test                            # Run tests
bunx oxlint                         # Lint code
bunx oxfmt                          # Format code
```
