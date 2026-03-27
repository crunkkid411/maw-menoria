<div align="center">

<img width="400" alt="maw" src="https://github.com/user-attachments/assets/f6068458-707f-438e-88b2-a8c6982269ef" />

**Crawl any site. Search it forever.**

[Install](#install) · [Commands](#commands) · [Examples](#examples) · [FAQ](#faq)

</div>

---

No more bookmarking docs you'll forget about. No more 47 browser tabs. No more "I read this somewhere but can't find it."

## Install

```bash
npm i -g @memvid/maw
```

Or just `npx @memvid/maw` if you don't want to install anything.

**Prerequisites:**
- [Rust](https://rustup.rs/) (for Mnemoria storage)
- ~130MB for embedding model (downloaded on first use)
- Optional: [Ollama](https://ollama.com/) for local LLM Q&A

## The basics

```bash
maw https://react.dev              # crawls entire site → maw.maw/
maw find maw.maw "useEffect"       # instant search
maw ask maw.maw "when should I use useCallback vs useMemo?"  # AI answers (needs Ollama)
```

The first two work out of the box. For AI answers, either:
- Install [Ollama](https://ollama.com/) for local LLM (recommended), or
- Set `OPENAI_API_KEY` environment variable for OpenAI

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
maw <url>                             # saves to maw.maw/
maw <url> -o docs.maw/                # custom output directory
maw <url> docs.maw                    # same (appends if directory exists)
maw <url> --depth 5 --max-pages 500   # go deeper
```

**Search**
```bash
maw find docs.maw "authentication"    # keyword search (hybrid BM25 + semantic)
maw ask docs.maw "how do I do X?"     # AI-powered answers (needs Ollama)
maw list docs.maw                     # see what's in there
```

**Preview before crawling**
```bash
maw preview stripe.com                # shows sitemap, page count estimate
```

**Export**
```bash
maw export docs.maw -f markdown      # dump everything to markdown
maw export docs.maw -f json          # or json
```

## How it works

- **Storage**: [Mnemoria](https://github.com/one-bit/mnemoria) - open-source, unlimited storage
- **Search**: Hybrid BM25 + semantic search (built-in embeddings)
- **Crawling**: fetch → Playwright → rebrowser (stealth)

## All the flags

| Flag | What it does | Default |
|------|--------------|---------|
| `-o, --output <dir>` | Output directory | `maw.maw/` |
| `-d, --depth <n>` | How deep to crawl | `2` |
| `-m, --max-pages <n>` | Stop after this many pages | `150` |
| `-c, --concurrency <n>` | Parallel requests | `10` |
| `-r, --rate-limit <n>` | Max requests/second | `10` |
| `--include <regex>` | Only crawl URLs matching this | - |
| `--exclude <regex>` | Skip URLs matching this | - |
| `--browser` | Force browser mode | - |
| `--stealth` | Force stealth mode | - |
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

# combine sources into one memory
maw https://react.dev https://nextjs.org -o frontend.maw/
```

## Limits

**Unlimited!** No API keys required, no size limits. Your only constraint is disk space.

## FAQ

**Is this legal?**

Respects robots.txt by default. What you do with `--no-robots` is your business.

**What's a .maw directory?**

A local memory store using [Mnemoria](https://github.com/one-bit/mnemoria). Contains:
- `mnemoria/log.bin` - append-only data
- `mnemoria/manifest.json` - metadata and checksums

**Programmatic usage?**

```javascript
import { maw, find, ask } from '@memvid/maw'

await maw(['https://example.com'], { output: 'site.maw/' })
const results = await find('site.maw/', 'search term')
const answer = await ask('site.maw/', 'explain this to me')
```

**How does the AI Q&A work?**

For local LLM:
1. Install [Ollama](https://ollama.com/)
2. Run `ollama serve` in background
3. Use `maw ask <memory> "<question>"` - defaults to llama3.2

For OpenAI:
1. Set `OPENAI_API_KEY` environment variable
2. Use `--model gpt-4o-mini` flag if needed

**Will I get rate limited?**

Default is 10 req/sec with backoff. Most sites won't notice. If you're worried, use `--rate-limit 2`.

**JS-rendered content?**

Works. Falls back to a real browser automatically when needed.

---

[MIT License](LICENSE)
