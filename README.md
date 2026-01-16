<div align="center">

<img width="400" alt="maw" src="https://github.com/user-attachments/assets/f6068458-707f-438e-88b2-a8c6982269ef" />

**Crawl any site. Search it forever.**

[![npm](https://img.shields.io/npm/v/@memvid/maw)](https://www.npmjs.com/package/@memvid/maw)
[![downloads](https://img.shields.io/npm/dm/@memvid/maw)](https://www.npmjs.com/package/@memvid/maw)
[![license](https://img.shields.io/npm/l/@memvid/maw)](LICENSE)

[Install](#install) · [Commands](#commands) · [Examples](#examples) · [FAQ](#faq)

</div>

---

No more bookmarking docs you'll forget about. No more 47 browser tabs. No more "I read this somewhere but can't find it."

## Install

```bash
npm i -g @memvid/maw
```

Or just `npx @memvid/maw` if you don't want to install anything.

## The basics

```bash
maw https://react.dev              # crawls entire site → maw.mv2
maw find maw.mv2 "useEffect"       # instant search
maw ask maw.mv2 "when should I use useCallback vs useMemo?"  # AI answers
```

That last one needs `OPENAI_API_KEY` in your env. The first two work out of the box.

## What can you crawl?

Basically anything.

```bash
maw https://docs.python.org        # documentation (2,847 pages, ~4 min)
maw https://paulgraham.com         # blogs
maw .                              # your local codebase
maw https://github.com/user/repo   # any git repo
maw "https://news.ycombinator.com/item?id=12345"  # single pages
```

It figures out the right approach automatically:
- Single page URL → fetches just that page
- Domain root → crawls everything it can find
- Local path → reads your files directly
- Cloudflare/bot protection → switches to stealth browser

## Commands

**Crawl**
```bash
maw <url>                             # saves to maw.mv2
maw <url> -o docs.mv2                 # custom output file
maw <url> docs.mv2                    # same (appends if file exists)
maw <url> --depth 5 --max-pages 500   # go deeper
```

**Search**
```bash
maw find docs.mv2 "authentication"    # keyword search
maw ask docs.mv2 "how do I do X?"     # AI-powered answers
maw list docs.mv2                     # see what's in there
```

**Preview before crawling**
```bash
maw preview stripe.com                # shows sitemap, page count estimate
```

**Export**
```bash
maw export docs.mv2 -f markdown       # dump everything to markdown
maw export docs.mv2 -f json           # or json
```

## Semantic search

By default you get keyword search (BM25). It's fast and works well for most things.

Want semantic search? Add `--embed`:

```bash
maw https://kubernetes.io/docs --embed openai
```

Costs about $0.01 per 1000 pages. Your queries will understand meaning, not just keywords.

## How it handles protected sites

```
fetch (fast) → playwright (real browser) → rebrowser (stealth)
```

90% of sites work with a simple fetch. The other 10% get a real browser. If that's blocked too, stealth mode usually gets through.

You don't have to think about this. It just tries each approach until something works.

## All the flags

| Flag | What it does | Default |
|------|--------------|---------|
| `-o, --output <file>` | Output file | `maw.mv2` |
| `-d, --depth <n>` | How deep to crawl | `2` |
| `-m, --max-pages <n>` | Stop after this many pages | `150` |
| `-c, --concurrency <n>` | Parallel requests | `10` |
| `-r, --rate-limit <n>` | Max requests/second | `10` |
| `--include <regex>` | Only crawl URLs matching this | - |
| `--exclude <regex>` | Skip URLs matching this | - |
| `--browser` | Force browser mode | - |
| `--stealth` | Force stealth mode | - |
| `--embed [model]` | Enable semantic embeddings | - |
| `--no-robots` | Ignore robots.txt | - |
| `--no-sitemap` | Don't use sitemap.xml | - |

## Examples

```bash
# grab some docs
maw https://react.dev
maw https://docs.python.org
maw https://stripe.com/docs

# archive a blog
maw https://paulgraham.com/articles.html

# your own code
maw .
maw https://github.com/your/repo

# combine sources into one file
maw https://react.dev https://nextjs.org -o frontend.mv2

# big crawl with semantic search
maw https://kubernetes.io/docs --depth 4 --max-pages 1000 --embed openai
```

## Limits

Up to **50MB** works without an API key. That's roughly 500-2000 pages depending on how much text is on each page.

Need more? Get a key at [memvid.com](https://memvid.com).

## FAQ

**Is this legal?**

Respects robots.txt by default. What you do with `--no-robots` is your business.

**What's an .mv2 file?**

A [memvid](https://memvid.com) file. Single-file database with search built in. Like SQLite but for documents and memory.

**Programmatic usage?**

```javascript
import { maw, find, ask } from '@memvid/maw'

await maw(['https://example.com'], { output: 'site.mv2' })
const results = await find('site.mv2', 'search term')
const answer = await ask('site.mv2', 'explain this to me')
```

**Will I get rate limited?**

Default is 10 req/sec with backoff. Most sites won't notice. If you're worried, use `--rate-limit 2`.

**JS-rendered content?**

Works. Falls back to a real browser automatically when needed.

---

[MIT License](LICENSE) · Built on [memvid](https://memvid.com)
