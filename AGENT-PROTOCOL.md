# MAW Agent Protocol

**Version:** 1.0  
**Purpose:** Standardized protocol for AI agents to manage and query MAW knowledge bases

---

## Overview

MAW (Markdown Any Website) converts any website into a searchable local knowledge base. This protocol defines how AI agents should:

1. **Manage** knowledge bases (crawl, update, maintain)
2. **Query** knowledge bases (search, retrieve context)
3. **Inject** knowledge into conversations (for brainstorming, Q&A, analysis)

**Key Design Principles:**
- **Agent-first:** All CLI commands run by the agent, not the user
- **Deterministic:** Same steps every time
- **Update-aware:** Only crawl when content changes
- **No server bloat:** Direct file-based access, no HTTP layer

---

## Configuration

### Location
`maw-knowledge.json` in the project root

### Schema
```json
{
  "version": "1.0",
  "_meta": {
    "description": "MAW Knowledge Base Configuration",
    "updated_by": "scripts/maw-protocol.py"
  },
  "knowledge_bases": {
    "<name>": {
      "url": "<source_url>",
      "depth": <crawl_depth>,
      "max_pages": <page_limit>,
      "created_at": "<ISO timestamp>",
      "updated_at": "<ISO timestamp>",
      "last_crawled": "<ISO timestamp or null>",
      "metadata": {
        "etag": "<ETag header or null>",
        "last_modified": "<Last-Modified header or null>",
        "content_hash": "<SHA256 hash or null>"
      },
      "status": "pending|ready|error"
    }
  }
}
```

### Reading the Config
```python
import json
from pathlib import Path

config_path = Path("maw-knowledge.json")
config = json.load(open(config_path))

# Get a specific knowledge base
handy_config = config["knowledge_bases"].get("handy")
if handy_config:
    url = handy_config["url"]
    status = handy_config["status"]
```

---

## Commands Reference

All commands use the Python script: `scripts/maw-protocol.py`

### Add a Knowledge Base
```powershell
python scripts/maw-protocol.py --add <name> <url> [--depth N]
```

**Example:**
```powershell
python scripts/maw-protocol.py --add handy https://handy.computer/docs/general --depth 2
```

**What it does:**
- Adds entry to `maw-knowledge.json`
- Sets status to `"pending"`
- Does NOT crawl yet

---

### Crawl a Knowledge Base
```powershell
python scripts/maw-protocol.py --crawl <name> [--force]
```

**Example:**
```powershell
python scripts/maw-protocol.py --crawl handy
```

**What it does:**
1. Checks if content updated (ETag → Last-Modified → Content Hash)
2. Skips crawl if unchanged (unless `--force`)
3. Runs MAW to crawl and convert to markdown
4. Updates `last_crawled` timestamp
5. Sets status to `"ready"`

**Output location:** `knowledge-bases/<name>/*.md`

---

### Crawl All Knowledge Bases
```powershell
python scripts/maw-protocol.py --crawl-all [--force]
```

**What it does:**
- Iterates all configured sources
- Crawls each one (respecting update checks)
- Shows progress for each

---

### Check Status
```powershell
python scripts/maw-protocol.py --status
```

**Output:**
```
======================================================================
Name                 Status     Last Crawled              URL
======================================================================
handy                ready      2025-03-28T10:30:00       https://handy.computer/docs/general
react                ready      2025-03-27T15:45:00       https://react.dev
======================================================================
```

---

### List Knowledge Bases
```powershell
python scripts/maw-protocol.py --list
```

**Output:**
```
Configured Knowledge Bases:

  handy
    URL: https://handy.computer/docs/general
    Depth: 2
    Status: ready
    Last Crawled: 2025-03-28T10:30:00

  react
    URL: https://react.dev
    Depth: 1
    Status: ready
    Last Crawled: 2025-03-27T15:45:00
```

---

## Agent Workflow

### Scenario 1: User Wants to Discuss a Topic

**User:** *"I want to understand how Handy handles sync"*

**Agent Thought Process:**
1. **Identify topic:** "Handy"
2. **Check config:** Read `maw-knowledge.json`, look for `"handy"`
3. **Check status:**
   - If not found → Add it: `--add handy <url>`
   - If status `"pending"` → Crawl it: `--crawl handy`
   - If status `"ready"` → Check if update needed
4. **Query knowledge base:** Search markdown files for relevant content
5. **Inject context:** Synthesize findings into conversation

**Agent Actions:**
```python
# 1. Check if knowledge base exists
config = load_config()
if "handy" not in config["knowledge_bases"]:
    # Add it
    run_command("python scripts/maw-protocol.py --add handy https://handy.computer/docs/general")

# 2. Check status
source = config["knowledge_bases"]["handy"]
if source["status"] != "ready":
    # Crawl it
    run_command("python scripts/maw-protocol.py --crawl handy")

# 3. Search for relevant content
results = search_markdown_files(
    directory="knowledge-bases/handy",
    query="sync synchronization conflict resolution"
)

# 4. Synthesize and respond
context = format_search_results(results)
respond_with_context(context)
```

---

### Scenario 2: User Asks a Specific Question

**User:** *"Query: handy - how does local-first sync work?"*

**Agent Actions:**
1. Parse topic: `"handy"`
2. Parse query: `"how does local-first sync work?"`
3. Verify knowledge base is ready
4. Search markdown files with query keywords
5. Extract relevant passages
6. Answer using extracted knowledge

**Search Strategy:**
```python
keywords = extract_keywords("local-first sync")
# Search for: ["local-first", "local first", "sync", "synchronization", "conflict"]

results = []
for md_file in Path("knowledge-bases/handy").glob("*.md"):
    content = md_file.read_text(encoding='utf-8')
    for keyword in keywords:
        if keyword.lower() in content.lower():
            results.append({
                "file": str(md_file),
                "keyword": keyword,
                "excerpt": extract_context_window(content, keyword)
            })
```

---

### Scenario 3: Knowledge Base Needs Update

**User:** *"Is the Handy docs up to date?"*

**Agent Actions:**
1. Run status check with update detection
2. Report findings

```powershell
python scripts/maw-protocol.py --status
```

**If update detected:**
```powershell
python scripts/maw-protocol.py --crawl handy
```

---

## Querying Knowledge Bases

### Method 1: Simple Keyword Search
```python
from pathlib import Path

def search_kb(name: str, query: str) -> list:
    """Search a knowledge base for query terms."""
    kb_dir = Path(f"knowledge-bases/{name}")
    if not kb_dir.exists():
        return []
    
    results = []
    keywords = query.lower().split()
    
    for md_file in kb_dir.glob("*.md"):
        content = md_file.read_text(encoding='utf-8')
        matches = []
        
        for keyword in keywords:
            if keyword in content.lower():
                # Extract context window (100 chars before/after)
                idx = content.lower().find(keyword)
                start = max(0, idx - 100)
                end = min(len(content), idx + 100)
                matches.append({
                    "keyword": keyword,
                    "context": content[start:end].strip()
                })
        
        if matches:
            results.append({
                "file": str(md_file),
                "matches": matches
            })
    
    return results
```

---

### Method 2: MAW Built-in Search
```powershell
# Use MAW's native search (hybrid BM25 + semantic)
maw find knowledge-bases/handy.maw "sync mechanism"
```

**Note:** This requires the `.maw` format (Mnemoria storage). The protocol script creates markdown files. If you need semantic search, use:
```powershell
# Crawl directly to .maw format
npx @agentdeskai/maw@latest <url> --output knowledge-bases/<name>.maw
```

---

### Method 3: Full-Text Index (Advanced)
```python
import whoosh.index as index
from whoosh.fields import Schema, TEXT

# Build index once
schema = Schema(title=TEXT(stored=True), content=TEXT)
ix = index.create_in("index", schema)

writer = ix.writer()
for md_file in Path("knowledge-bases/handy").glob("*.md"):
    content = md_file.read_text(encoding='utf-8')
    writer.add_document(title=md_file.stem, content=content)
writer.commit()

# Search
from whoosh.qparser import QueryParser
with ix.searcher() as searcher:
    query = QueryParser("content", ix.schema).parse("sync")
    results = searcher.search(query)
    for hit in results:
        print(hit["title"], hit.score)
```

---

## Error Handling

### Knowledge Base Not Found
```python
source = get_source(name)
if not source:
    logger.error(f"Knowledge base '{name}' not found")
    # Option 1: Auto-add if URL is known
    if name in KNOWN_SOURCES:
        run_command(f"--add {name} {KNOWN_SOURCES[name]}")
    # Option 2: Ask user for URL
    else:
        url = ask_user(f"What's the URL for {name}?")
        run_command(f"--add {name} {url}")
```

---

### Crawl Failed
```python
success = run_maw_crawl(name, source)
if not success:
    logger.error("Crawl failed")
    # Check common issues:
    # 1. Network connectivity
    # 2. Site blocks crawlers
    # 3. MAW not installed
    # 4. Rate limiting
    
    # Fallback: Try with --browser flag
    logger.info("Retrying with browser mode...")
    cmd = f'npx @agentdeskai/maw@latest "{url}" --output "{output_dir}" --browser'
```

---

### No Updates But User Insists
```python
# User says: "Crawl it anyway"
run_command("--crawl handy --force")
```

---

## Best Practices

### 1. Batch Crawls
Don't crawl one at a time during conversation. Use:
```powershell
python scripts/maw-protocol.py --crawl-all
```

### 2. Pre-Crawl Common Sources
Maintain a list of commonly-used docs:
```python
COMMON_SOURCES = {
    "react": "https://react.dev",
    "python": "https://docs.python.org/3",
    "handy": "https://handy.computer/docs/general",
    "mdn": "https://developer.mozilla.org"
}
```

### 3. Respect Rate Limits
Add delays between crawls:
```python
for name in sources:
    crawl(name)
    time.sleep(2)  # 2 second delay
```

### 4. Log Everything
```python
logging.basicConfig(
    filename='maw-protocol.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
```

### 5. Validate Before Responding
Always check:
- Knowledge base exists
- Status is `"ready"`
- Files actually exist in `knowledge-bases/<name>/`

---

## Example Agent Thought Process

**User:** *"I'm curious about Handy's approach to conflict resolution. Can you explain how it works?"*

**Agent:**
```
Thought: User wants to know about Handy's conflict resolution.

Step 1: Check if I have Handy knowledge base
- Read maw-knowledge.json
- Found: "handy" entry exists, status = "ready", last_crawled = 2025-03-28

Step 2: Query the knowledge base
- Search query: "conflict resolution sync"
- Search directory: knowledge-bases/handy/
- Found 3 matching files

Step 3: Extract relevant content
- File: sync-model.md - discusses CRDT-based conflict resolution
- File: architecture.md - mentions local-first sync
- File: getting-started.md - brief mention of offline editing

Step 4: Synthesize answer
- Handy uses CRDTs (Conflict-free Replicated Data Types)
- Conflicts resolved automatically at character level
- No manual merge needed
- Works offline, syncs when online

Step 5: Respond with sourced information
- Provide explanation
- Cite which files contained the info
- Offer to search for more details if needed
```

---

## Trigger Phrases

Users may say:

| User Says | Agent Action |
|-----------|--------------|
| *"Load context: handy"* | Check/fetch handy KB, search for general info |
| *"Query: handy - how does X work?"* | Search handy KB for X |
| *"I want to ask about handy"* | Ensure handy KB exists, wait for question |
| *"Is handy up to date?"* | Run `--status`, check for updates |
| *"Get the latest Handy docs"* | Run `--crawl handy --force` |

---

## File Structure

```
maw/
├── maw-knowledge.json              # Config file
├── scripts/
│   └── maw-protocol.py             # Management script
├── knowledge-bases/
│   ├── handy/
│   │   ├── page1.md
│   │   ├── page2.md
│   │   └── ...
│   └── react/
│       └── ...
└── AGENT-PROTOCOL.md               # This document
```

---

## Troubleshooting

### "npx: command not found"
**Fix:** Install Node.js from https://nodejs.org/

### "MAW crawl failed with code 1"
**Possible causes:**
1. Site blocks automated access
   - Fix: Add `--browser` flag to command
2. Rate limited
   - Fix: Wait 5 minutes, try again with `--rate-limit 2`
3. Invalid URL
   - Fix: Verify URL is accessible in browser

### "No updates detected" but site changed
**Explanation:** Update check uses HTTP headers (ETag, Last-Modified). Some sites don't send these correctly.

**Fix:** Use `--force` to re-crawl:
```powershell
python scripts/maw-protocol.py --crawl handy --force
```

### Markdown files are empty
**Cause:** Site requires JavaScript to render content.

**Fix:** Crawl with browser mode:
```powershell
npx @agentdeskai/maw@latest "<url>" --output "knowledge-bases/handy" --browser
```

---

## Summary

**For Agents:**
1. Read `maw-knowledge.json` to find knowledge bases
2. Run `--crawl <name>` to fetch/update
3. Search `knowledge-bases/<name>/*.md` for query terms
4. Synthesize and respond with sourced information

**For Users:**
- Just tell the agent what you want to discuss
- Agent handles all CLI commands
- No manual intervention needed

**Key Commands:**
```powershell
# Add a source
python scripts/maw-protocol.py --add <name> <url>

# Crawl (with update check)
python scripts/maw-protocol.py --crawl <name>

# Force re-crawl
python scripts/maw-protocol.py --crawl <name> --force

# Check status
python scripts/maw-protocol.py --status
```

---

**End of Protocol**
