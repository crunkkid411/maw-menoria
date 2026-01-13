<div align="center">

<img src="s_maw.svg" alt="maw" width="400">

**Crawl any site. Search it forever.**

[![npm](https://img.shields.io/npm/v/@memvid/maw)](https://www.npmjs.com/package/@memvid/maw)
[![downloads](https://img.shields.io/npm/dm/@memvid/maw)](https://www.npmjs.com/package/@memvid/maw)
[![license](https://img.shields.io/npm/l/@memvid/maw)](LICENSE)

[Install](#install) · [Commands](#commands) · [Examples](#examples) · [FAQ](#faq)

</div>

---

Feed the maw. It never forgets.

```bash
npx @memvid/maw https://stripe.com/docs
```

That's it. The entire Stripe docs are now in a 40MB file you can search and ask questions to. Offline. Forever.

## Why?

Because you shouldn't need to keep 47 browser tabs open or bookmark links you'll never read again. Crawl once, query forever.

```bash
# later, when you actually need it
maw ask stripe.mv2 "how do webhooks work?"
```

## Install

```bash
npm i -g @memvid/maw
```

Or just use `npx @memvid/maw` without installing.

## What it does

```
maw https://react.dev           → react.mv2 (312 pages, 18s)
maw https://docs.python.org     → python.mv2 (2,847 pages, 4min)
maw .                           → repo.mv2 (your local git repo)
maw https://news.ycombinator.com/item?id=12345  → just that page
```

Smart defaults:
- **Single page URL?** Fetches just that page
- **Domain root?** Crawls the whole site
- **Local path?** Reads your git repo
- **Protected site?** Auto-switches to stealth browser

## Commands

### Crawl

```bash
maw <url>                           # → maw.mv2
maw <url> -o docs.mv2               # custom output
maw <url> docs.mv2                  # same thing (appends if exists)
maw <url> --depth 5 --max-pages 500 # go deeper
```

### Query

```bash
maw find docs.mv2 "authentication"  # full-text search
maw ask docs.mv2 "how does X work?" # AI answer (needs OPENAI_API_KEY)
maw list docs.mv2                   # see what's inside
```

### Preview

```bash
maw preview stripe.com              # shows sitemap, estimated page count
```

### Export

```bash
maw export docs.mv2 -f markdown -o docs.md
maw export docs.mv2 -f json -o docs.json
```

## Embeddings

Want semantic search? Add `--embed`:

```bash
maw https://docs.whatever.com --embed openai
```

Uses OpenAI embeddings for semantic search. Costs ~$0.01 per 1000 pages. Without it, you get BM25 keyword search (still good, just different).

## How it works

Most sites work with a simple fetch. When that fails (Cloudflare, JS-heavy SPAs), maw falls back to a real browser. When *that* fails (aggressive anti-bot), it uses stealth mode.

```
fetch (fast) → playwright (slower) → rebrowser (stealth)
     ↓              ↓                      ↓
   works?        blocked?              blocked?
     ↓              ↓                      ↓
    done          retry                  done
```

90% of sites never need the browser. The 10% that do, just work.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <file>` | Output file | `maw.mv2` |
| `-d, --depth <n>` | Crawl depth | `2` |
| `-m, --max-pages <n>` | Max pages to crawl | `150` |
| `-c, --concurrency <n>` | Parallel requests | `10` |
| `-r, --rate-limit <n>` | Requests per second | `10` |
| `--include <regex>` | Only crawl matching URLs | - |
| `--exclude <regex>` | Skip matching URLs | - |
| `--browser` | Force browser mode | - |
| `--stealth` | Force stealth mode | - |
| `--embed [model]` | Enable embeddings | - |
| `--no-robots` | Ignore robots.txt | - |
| `--no-sitemap` | Skip sitemap discovery | - |

## Examples

```bash
# documentation sites
maw https://react.dev
maw https://docs.python.org
maw https://stripe.com/docs

# news/blogs
maw https://paulgraham.com/articles.html
maw "https://news.ycombinator.com/item?id=40000000"

# your own repos
maw . -o my-project.mv2
maw https://github.com/user/repo

# combine multiple sources
maw https://react.dev https://nextjs.org -o frontend.mv2

# deep crawl with embeddings
maw https://kubernetes.io/docs --depth 4 --max-pages 1000 --embed openai
```

## Limits

Files up to **50MB** work without any API key. That's roughly 500-2000 pages depending on content.

For bigger crawls, get a key at [memvid.com](https://memvid.com).

## FAQ

**Is this legal?**

Respects robots.txt by default. Use `--no-robots` at your own discretion.

**Why .mv2?**

It's a [memvid](https://memvid.com) file — single-file database with full-text search, embeddings, and temporal queries baked in. Think SQLite but for documents.

**Can I use it programmatically?**

```javascript
import { crawl, query } from 'maw'

await crawl('https://example.com', { output: 'site.mv2' })
const results = await query('site.mv2', 'search term')
```

**What about rate limiting?**

Default is 10 req/sec with automatic backoff. Most sites won't notice you. If you're hitting APIs, consider `--rate-limit 2`.

**Does it handle JavaScript-rendered content?**

Yes. If fetch fails, it automatically tries Playwright. For heavily protected sites, use `--stealth`.

---

[MIT License](LICENSE) · Built on [memvid](https://memvid.com)
