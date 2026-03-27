**Maw/Memvid is essentially open-source technology with a commercial gatekeeping layer baked into the CLI/SDK.** The core engine is legitimate and useful—single-file BM25 + vector search with crawling capabilities—but the 50MB limit is an artificial constraint, not a technical one.

## The Gatekeeping Mechanism

From the GitHub issue where someone tried to bypass the limit :

> Even when users issue **self-hosted tickets** with 10GB capacity, the CLI still enforces the 50MB "free tier" limit. The `stats` command recognizes the ticket (showing "100.1 MB used / 10.0 GB total"), but `put` operations are blocked with: *"To store more than 1GB, you need a paid plan."*

The tier system is hardcoded based on Write-Ahead Log (WAL) size :
- WAL < 4MB → Free tier (50MB limit)
- WAL 4-16MB → Dev tier (2GB limit) 
- WAL ≥ 16MB → Enterprise tier (10GB limit)

**This is enforced client-side in the CLI**, not by any technical limitation of the .mv2 file format itself.

## What The Technology Actually Is

The underlying stack is genuinely open-source and self-hostable :

| Component | Technology | License |
|-----------|-----------|---------|
| **Storage format** | `.mv2` single-file (header + WAL + segments + indices + footer) | Apache 2.0 |
| **Lexical search** | Tantivy (Rust BM25 implementation) | MIT |
| **Vector search** | HNSW index + ONNX embeddings (local) | Apache 2.0 |
| **Embeddings** | Local models (bge-small, nomic) or OpenAI | Various |
| **Crawling** | fetch → Playwright → rebrowser (stealth) | Local execution |
| **Core engine** | `memvid-core` (Rust) | Apache 2.0 |

The .mv2 format is just a structured binary file with embedded search indices—there's no technical reason it can't be 10GB or 100GB on a local machine .

## What a Pure, API-Free Version Requires

To refactor this into a truly unrestricted tool:

### 1. **Remove the Ticket Enforcement** (Critical)
The CLI checks capacity against a "ticket" system that requires memvid.com API keys. You'd need to:
- Fork the CLI/SDK code
- Remove the `signature.rs` verification module that validates Ed25519 tickets 
- Bypass the tier check in the `put` command that artificially limits to 50MB
- Make capacity checks based on actual filesystem space, not hardcoded tiers

### 2. **Ensure Local Embeddings Work**
The core already supports local embeddings via ONNX :
```rust
memvid-core = { version = "2.0", features = ["lex", "vec"] }
```
This uses `sentence-transformers/all-MiniLM-L6-v2` (384-dim) locally—no API needed.

### 3. **Replace Cloud-Dependent Features**
| Current (Gated) | Pure Alternative |
|----------------|------------------|
| Cloud sync to memvid.com | Git LFS, Syncthing, or manual file copy |
| Dashboard-issued tickets | Remove entirely—local files don't need permission |
| OpenAI Q&A | Local LLM (Ollama, llama.cpp, onnx) via the existing `LLMClient` pattern |

### 4. **The Crawling Layer (Already Clean)**
The `maw` crawler uses standard open-source tooling:
- **Fetch**: Node.js native fetch
- **Browser mode**: Playwright (real Chromium instance)
- **Stealth mode**: rebrowser-patches (open-source stealth patches)

None of this requires the memvid API.

## Existing Alternatives

There's already a **pure Rust reimplementation** called `memvid-rs`  that demonstrates this is possible:
- 150x faster encoding with Metal GPU acceleration
- TRUE BERT neural network inference via HuggingFace Candle (zero Python deps)
- Sub-second search across millions of chunks
- **No artificial limits**

## Next Steps

**This is open-source tech with a gatekeeping API.** The 50MB limit is unnecessary. To create a pure version:

1. Fork `memvid-core` (Rust) and `memvid-cli` (Node.js/TypeScript)
2. Remove the `tickets` verification system and hardcoded tier checks
3. Keep the `.mv2` format (it's well-documented in `MV2_SPEC.md` )
4. Use local ONNX embeddings instead of API-dependent ones
5. Point the `ask` command at a local llama.cpp or llama.dll instance instead of OpenAI

The value proposition of Maw—crawling sites into a searchable single file—is real. The artificial scarcity is just a business model choice that can be forked out.

## Final Thoughts

The final, refactored code should function just like MAW and be quick and easy for the user or any AI agents to use without overwhelming setup or documentation, just like the original MAW Projejct