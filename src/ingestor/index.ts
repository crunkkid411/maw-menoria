/**
 * MV2 ingestor - saves crawled content to .mv2 files
 */

import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import type { CrawlResult } from '../crawler/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger();

// Timeout wrapper to prevent SDK calls from hanging forever
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms / 1000}s`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Dynamic import for @memvid/sdk
let sdkModule: any = null;

async function getSDK() {
  if (!sdkModule) {
    sdkModule = await import('@memvid/sdk');
  }
  return sdkModule;
}

export interface IngestOptions {
  output: string;
  label?: string;
  batchSize?: number;
  maxSizeMB?: number; // Stop when approaching this size (default: 48MB to stay under 50MB)
  memoryId?: string;  // Cloud memory ID to bind to (from dashboard)
  memoryName?: string; // Name for auto-created memory (used when API key set but no memoryId)
  enableEmbedding?: boolean; // Enable semantic embeddings (slower but better search)
  embeddingModel?: string; // Embedding model: bge-small (default), openai, nvidia
}

export interface IngestStats {
  pages: number;
  bytes: number;
  duration: number;
  stoppedAtLimit?: boolean;
  skippedDupes?: number;
  memoryId?: string; // Cloud memory ID (auto-created or provided)
}

/**
 * Ingest crawled results into an MV2 file
 */
export async function ingestToMv2(
  results: AsyncIterable<CrawlResult>,
  options: IngestOptions
): Promise<IngestStats> {
  const sdk = await getSDK();
  const { create, use, configure, createMemory } = sdk;
  const startTime = Date.now();

  const apiKey = process.env.MEMVID_API_KEY;
  const dashboardUrl = process.env.MEMVID_DASHBOARD_URL || 'https://memvid.com';

  let memoryId = options.memoryId;

  // Configure SDK if API key is set
  if (apiKey) {
    configure({
      apiKey,
      dashboardUrl,
    });

    // Auto-create memory if API key is set but no memoryId provided
    if (!memoryId && !existsSync(options.output)) {
      try {
        const memoryName = options.memoryName || `maw-${Date.now()}`;
        log.dim(`  Creating cloud memory: ${memoryName}`);
        const memory = await createMemory({
          name: memoryName,
          description: `Created by maw CLI`,
        });
        memoryId = memory.id;
        log.dim(`  Memory ID: ${memoryId}`);
      } catch (err: any) {
        // Failed to create memory, continue without cloud binding
        log.warn(`  Could not create cloud memory: ${err.message}`);
      }
    }
  }

  // Create or open the MV2 file with optional cloud binding
  let mem;
  if (existsSync(options.output)) {
    mem = await use('basic', options.output);
    // Sync tickets if we have API key and memory ID
    if (apiKey && memoryId) {
      try {
        await mem.syncTickets(memoryId, apiKey, dashboardUrl);
      } catch {
        // Sync failed, continue with local
      }
    }
  } else {
    // Create new file, optionally bound to cloud memory
    const createOpts: any = {};
    if (apiKey && memoryId) {
      createOpts.memoryId = memoryId;
      createOpts.memvidApiKey = apiKey;
    }
    mem = await create(options.output, 'basic', createOpts);
  }

  let pages = 0;
  let totalBytes = 0;
  let skippedDupes = 0;
  let stoppedAtLimit = false;
  let estimatedFileSize = 0;
  // Batch size for ingestion (default 10)
  const batchSize = options.batchSize || 10;
  const batch: Array<{ title: string; label: string; text: string; metadata: Record<string, any> }> = [];

  // Size limit (default 40MB to stay safely under 50MB free tier with buffer)
  const maxSizeBytes = (options.maxSizeMB || 40) * 1024 * 1024;
  const hasApiKey = !!process.env.MEMVID_API_KEY;

  // Content fingerprints to skip near-duplicates
  const contentHashes = new Set<string>();

  for await (const result of results) {
    const markdown = result.extracted.markdown;

    // Simple content fingerprint to skip near-duplicates (first 2000 chars)
    const fingerprint = markdown.slice(0, 2000).replace(/\s+/g, ' ').trim();
    if (contentHashes.has(fingerprint)) {
      skippedDupes++;
      continue;
    }
    contentHashes.add(fingerprint);

    const doc = {
      title: result.extracted.title,
      label: options.label || 'web',
      text: markdown,
      metadata: {
        url: result.url,
        finalUrl: result.finalUrl,
        description: result.extracted.description,
        author: result.extracted.author,
        publishedDate: result.extracted.publishedDate,
        wordCount: result.extracted.wordCount,
        crawlDepth: result.depth,
        engine: result.engine,
        crawledAt: new Date().toISOString(),
      },
    };

    // Estimate document size (text + metadata + embeddings overhead ~3x)
    const docSize = markdown.length * 3;

    // Check if we'd exceed the limit (only if no API key)
    if (!hasApiKey && estimatedFileSize + docSize > maxSizeBytes) {
      stoppedAtLimit = true;
      log.warn(`  Reached ~${Math.round(estimatedFileSize / 1024 / 1024)}MB limit. Set MEMVID_API_KEY for unlimited.`);
      break;
    }

    batch.push(doc);
    pages++;
    totalBytes += result.extracted.byteSize;
    estimatedFileSize += docSize;

    // Show progress (in-place update)
    log.progressUpdate(pages, result.extracted.title.slice(0, 40));

    // Flush batch
    if (batch.length >= batchSize) {
      try {
        // Show saving status
        const savingLabel = options.enableEmbedding
          ? `Saving ${batch.length} pages + embedding...`
          : `Saving ${batch.length} pages...`;
        log.progressUpdate(pages, savingLabel);

        await withTimeout(
          mem.putMany(batch, options.enableEmbedding ? {
            enableEmbedding: true,
            embeddingModel: options.embeddingModel || 'openai',
          } : undefined),
          60000, // 60 second timeout per batch
          'Saving pages'
        );
        batch.length = 0;

        // Check actual file size after flush (only if no API key)
        if (!hasApiKey) {
          const currentSize = await getFileSize(options.output);
          if (currentSize > maxSizeBytes) {
            stoppedAtLimit = true;
            break;
          }
        }
      } catch (err: any) {
        // Handle SDK size limit error gracefully
        if (err.message?.includes('exceeds') && err.message?.includes('limit')) {
          stoppedAtLimit = true;
          break;
        }
        if (err.message?.includes('timed out')) {
          log.warn(`  Save operation timed out. The SDK may be having issues.`);
          throw err;
        }
        throw err;
      }
    }
  }

  // Flush remaining (with error handling)
  if (batch.length > 0 && !stoppedAtLimit) {
    try {
      // Show saving status for final batch
      const savingLabel = options.enableEmbedding
        ? `Saving final ${batch.length} pages + embedding...`
        : `Saving final ${batch.length} pages...`;
      log.progressUpdate(pages, savingLabel);

      await withTimeout(
        mem.putMany(batch, options.enableEmbedding ? {
          enableEmbedding: true,
          embeddingModel: options.embeddingModel || 'openai',
        } : undefined),
        60000, // 60 second timeout
        'Saving final pages'
      );
    } catch (err: any) {
      if (err.message?.includes('exceeds') && err.message?.includes('limit')) {
        stoppedAtLimit = true;
      } else if (err.message?.includes('timed out')) {
        log.warn(`  Save operation timed out. The SDK may be having issues.`);
        throw err;
      } else {
        throw err;
      }
    }
  }

  // End progress display
  log.progressEnd();

  const duration = Date.now() - startTime;

  return {
    pages,
    bytes: totalBytes,
    duration,
    stoppedAtLimit,
    skippedDupes,
    memoryId,
  };
}

export interface GitIngestOptions {
  output: string;
  label?: string;
  memoryId?: string;
  memoryName?: string;
  enableEmbedding?: boolean; // Enable semantic embeddings (slower but better search)
  embeddingModel?: string; // Embedding model: bge-small (default), openai, nvidia
  maxSizeMB?: number; // Stop when approaching this size (default: 40MB to stay under 50MB)
}

export interface GitIngestStats {
  files: number;
  bytes: number;
  duration: number;
  memoryId?: string;
  stoppedAtLimit?: boolean;
}

/**
 * Ingest git repo files into an MV2 file
 */
export async function ingestGitToMv2(
  files: AsyncIterable<{ path: string; content: string; language: string; size: number }>,
  options: GitIngestOptions
): Promise<GitIngestStats> {
  const sdk = await getSDK();
  const { create, use, configure, createMemory } = sdk;
  const startTime = Date.now();

  const apiKey = process.env.MEMVID_API_KEY;
  const dashboardUrl = process.env.MEMVID_DASHBOARD_URL || 'https://memvid.com';

  let memoryId = options.memoryId;

  // Configure SDK if API key is set
  if (apiKey) {
    configure({ apiKey, dashboardUrl });

    // Auto-create memory if API key is set but no memoryId provided
    if (!memoryId && !existsSync(options.output)) {
      try {
        const memoryName = options.memoryName || `maw-repo-${Date.now()}`;
        log.dim(`  Creating cloud memory: ${memoryName}`);
        const memory = await createMemory({
          name: memoryName,
          description: `Git repo ingested by maw CLI`,
        });
        memoryId = memory.id;
        log.dim(`  Memory ID: ${memoryId}`);
      } catch (err: any) {
        log.warn(`  Could not create cloud memory: ${err.message}`);
      }
    }
  }

  // Create or open the MV2 file
  let mem;
  if (existsSync(options.output)) {
    mem = await use('basic', options.output);
    if (apiKey && memoryId) {
      try {
        await mem.syncTickets(memoryId, apiKey, dashboardUrl);
      } catch {}
    }
  } else {
    const createOpts: any = {};
    if (apiKey && memoryId) {
      createOpts.memoryId = memoryId;
      createOpts.memvidApiKey = apiKey;
    }
    mem = await create(options.output, 'basic', createOpts);
  }

  let fileCount = 0;
  let totalBytes = 0;
  let stoppedAtLimit = false;
  let estimatedFileSize = 0;
  // Batch size for ingestion (default 10)
  const batchSize = 10;
  const batch: Array<{ title: string; label: string; text: string; metadata: Record<string, any> }> = [];

  // Size limit (default 40MB to stay safely under 50MB free tier)
  const maxSizeBytes = (options.maxSizeMB || 40) * 1024 * 1024;
  const hasApiKey = !!process.env.MEMVID_API_KEY;

  // Embedding overhead: ~6KB per chunk for 1536-dim vectors (OpenAI), less for smaller models
  const embeddingOverhead = options.enableEmbedding ? 6000 : 0;

  for await (const file of files) {
    // Check if this is a README or documentation file
    const isReadme = /readme\.md$/i.test(file.path);
    const isDocs = /^(docs|documentation)\//i.test(file.path) || /\.(md|mdx|rst)$/i.test(file.path);

    // Build enhanced text for README files to improve retrieval
    let text = `File: ${file.path}\nLanguage: ${file.language}\n\n${file.content}`;

    // For README files, prepend searchable context
    if (isReadme) {
      const projectName = file.path.includes('/') ? '' : file.content.match(/^#\s+(.+)/m)?.[1] || '';
      text = `Project Overview: ${projectName}\nThis is the main README documentation.\nIntroduction and description of the project.\n\n${text}`;
    }

    // Create document with code content
    // Format: include file path as context, then the actual code
    // This helps the LLM understand what file it's looking at
    const doc: any = {
      title: `${file.path} (${file.language})`,
      label: options.label || 'code',
      text,
      uri: `file://${file.path}`, // Use file path as URI for scope filtering
      metadata: {
        path: file.path,
        language: file.language,
        size: file.size,
        type: isReadme ? 'readme' : (isDocs ? 'docs' : 'code'),
        isReadme,
        ingestedAt: new Date().toISOString(),
      },
    };

    // Add labels for better categorization
    if (isReadme) {
      doc.labels = ['README', 'Documentation', 'Overview', 'Introduction'];
    } else if (isDocs) {
      doc.labels = ['Documentation'];
    }

    // Estimate document size (text + metadata + embedding vectors)
    const docSize = text.length * 2 + embeddingOverhead;

    // Check if we'd exceed the limit (only if no API key)
    if (!hasApiKey && estimatedFileSize + docSize > maxSizeBytes) {
      stoppedAtLimit = true;
      log.warn(`  Reached ~${Math.round(estimatedFileSize / 1024 / 1024)}MB limit. Set MEMVID_API_KEY for unlimited.`);
      break;
    }

    batch.push(doc);
    fileCount++;
    totalBytes += file.size;
    estimatedFileSize += docSize;

    // Show progress (in-place update)
    log.progressUpdate(fileCount, file.path.slice(-40));

    // Flush batch
    if (batch.length >= batchSize) {
      try {
        // Show saving status
        const savingLabel = options.enableEmbedding
          ? `Saving ${batch.length} files + embedding...`
          : `Saving ${batch.length} files...`;
        log.progressUpdate(fileCount, savingLabel);

        await withTimeout(
          mem.putMany(batch, options.enableEmbedding ? {
            enableEmbedding: true,
            embeddingModel: options.embeddingModel || 'openai',
          } : undefined),
          60000, // 60 second timeout per batch
          'Saving files'
        );
        batch.length = 0;

        // Check actual file size after flush (only if no API key)
        if (!hasApiKey) {
          const currentSize = await getFileSize(options.output);
          if (currentSize > maxSizeBytes) {
            stoppedAtLimit = true;
            log.warn(`  Reached ${Math.round(currentSize / 1024 / 1024)}MB limit. Set MEMVID_API_KEY for unlimited.`);
            break;
          }
        }
      } catch (err: any) {
        // Handle SDK size limit error gracefully
        if (err.message?.includes('exceeds') && err.message?.includes('limit')) {
          stoppedAtLimit = true;
          break;
        }
        if (err.message?.includes('timed out')) {
          log.warn(`  Save operation timed out. The SDK may be having issues.`);
          throw err;
        }
        throw err;
      }
    }
  }

  // Flush remaining (with error handling)
  if (batch.length > 0 && !stoppedAtLimit) {
    try {
      // Show saving status for final batch
      const savingLabel = options.enableEmbedding
        ? `Saving final ${batch.length} files + embedding...`
        : `Saving final ${batch.length} files...`;
      log.progressUpdate(fileCount, savingLabel);

      await withTimeout(
        mem.putMany(batch, options.enableEmbedding ? {
          enableEmbedding: true,
          embeddingModel: options.embeddingModel || 'openai',
        } : undefined),
        60000, // 60 second timeout
        'Saving final files'
      );
    } catch (err: any) {
      if (err.message?.includes('exceeds') && err.message?.includes('limit')) {
        stoppedAtLimit = true;
      } else if (err.message?.includes('timed out')) {
        log.warn(`  Save operation timed out. The SDK may be having issues.`);
        throw err;
      } else {
        throw err;
      }
    }
  }

  // End progress display
  log.progressEnd();

  const duration = Date.now() - startTime;

  return {
    files: fileCount,
    bytes: totalBytes,
    duration,
    memoryId,
    stoppedAtLimit,
  };
}

/**
 * Get file size
 */
export async function getFileSize(path: string): Promise<number> {
  try {
    const stats = await stat(path);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Open an existing MV2 file for querying
 */
export async function openMv2(path: string) {
  const { use } = await getSDK();
  return use('basic', path);
}

/**
 * Search in an MV2 file
 * Uses semantic search when OPENAI_API_KEY is set, with fallback to lexical
 */
export async function searchMv2(
  path: string,
  query: string,
  options: { k?: number; embeddingModel?: string } = {}
) {
  const mem = await openMv2(path);

  // Determine search mode: use semantic if we have an API key for query embeddings
  // Use text-embedding-3-small (1536 dims) to match what maw uses during ingestion
  const queryEmbeddingModel = options.embeddingModel || (process.env.OPENAI_API_KEY ? 'openai-small' : undefined);
  const mode = queryEmbeddingModel ? 'auto' : 'lex';

  try {
    return await mem.find(query, {
      k: options.k || 10,
      mode,
      queryEmbeddingModel,
    });
  } catch (err: any) {
    // If vector search fails (dimension mismatch, etc.), fall back to lexical
    if (err.message?.includes('dimension') || err.message?.includes('embedding')) {
      log.warn('  Vector search unavailable, using lexical search');
      return mem.find(query, {
        k: options.k || 10,
        mode: 'lex',
      });
    }
    throw err;
  }
}

/**
 * Detect if question is asking about what something is/does
 */
function isOverviewQuestion(question: string): boolean {
  const lowerQ = question.toLowerCase();
  return (
    /^what (is|does|are)\b/.test(lowerQ) ||
    /^(explain|describe|tell me about)\b/.test(lowerQ) ||
    /^how does .+ work/.test(lowerQ) ||
    /overview|introduction|getting started/i.test(lowerQ)
  );
}

/**
 * Ask a question using an MV2 file
 * Uses semantic search when embeddings are available and OPENAI_API_KEY is set
 */
export async function askMv2(
  path: string,
  question: string,
  options: { model?: string; apiKey?: string; k?: number; embeddingModel?: string } = {}
) {
  const mem = await openMv2(path);

  // For overview questions, use higher k to get more diverse context including README chunks
  const isOverview = isOverviewQuestion(question);
  const effectiveK = options.k || (isOverview ? 15 : 8);

  // Determine search mode: use semantic/auto if we have an API key for query embeddings
  // Use text-embedding-3-small (1536 dims) to match what maw uses during ingestion
  const queryEmbeddingModel = options.embeddingModel || (process.env.OPENAI_API_KEY ? 'openai-small' : undefined);
  const mode = queryEmbeddingModel ? 'auto' : 'lex'; // auto = hybrid (semantic + lexical), lex = BM25 only

  try {
    return await mem.ask(question, {
      model: options.model || 'gpt-4o-mini',
      modelApiKey: options.apiKey || process.env.OPENAI_API_KEY,
      k: effectiveK,
      llmContextChars: isOverview ? 15000 : 8000, // More context for overview questions
      mode,
      queryEmbeddingModel,
    });
  } catch (err: any) {
    // If vector search fails (dimension mismatch, etc.), fall back to lexical
    if (err.message?.includes('dimension') || err.message?.includes('embedding')) {
      log.warn('  Vector search unavailable, using lexical search');
      return mem.ask(question, {
        model: options.model || 'gpt-4o-mini',
        modelApiKey: options.apiKey || process.env.OPENAI_API_KEY,
        k: effectiveK,
        llmContextChars: isOverview ? 15000 : 8000,
        mode: 'lex',
      });
    }
    throw err;
  }
}

/**
 * List documents in an MV2 file
 */
export async function listMv2(
  path: string,
  options: { limit?: number; offset?: number } = {}
) {
  const mem = await openMv2(path);
  // Use timeline or list method if available
  if (typeof mem.timeline === 'function') {
    return mem.timeline({ limit: options.limit || 100 });
  }
  // Fallback to find with empty query
  return mem.find('', { k: options.limit || 100 });
}

/**
 * Export documents from an MV2 file with full content
 */
export async function exportMv2(
  path: string,
  options: { limit?: number } = {}
): Promise<Array<{ title: string; uri: string; content: string }>> {
  const mem = await openMv2(path);

  // Get frame list
  const timeline = await mem.timeline({ limit: options.limit || 10000 });
  const frames = timeline.frames || timeline;

  // Get full content for each frame
  const results: Array<{ title: string; uri: string; content: string }> = [];

  for (const frame of frames) {
    // Skip child frames (they're included in parent)
    if (frame.child_frames && frame.child_frames.length > 0) {
      // This is a parent frame - get its full content
      try {
        const content = await mem.view(frame.frame_id);
        const uri = frame.uri || '';
        const title = uri.replace('file://', '').replace(/^https?:\/\//, '') || `Frame ${frame.frame_id}`;
        results.push({ title, uri, content });
      } catch {
        // Frame might not exist, skip
      }
    } else if (!frames.some((f: any) => f.child_frames?.includes(frame.frame_id))) {
      // This is a standalone frame (not a child of another)
      try {
        const content = await mem.view(frame.frame_id);
        const uri = frame.uri || '';
        const title = uri.replace('file://', '').replace(/^https?:\/\//, '') || `Frame ${frame.frame_id}`;
        results.push({ title, uri, content });
      } catch {
        // Frame might not exist, skip
      }
    }
  }

  return results;
}
