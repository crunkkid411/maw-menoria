import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { join, dirname } from 'path';
import type { CrawlResult } from '../crawler/index.js';
import { createLogger } from '../utils/logger.js';
import {
  ensureMnemoria,
  addDocument,
  addDocuments,
  searchDocuments,
  askQuestion,
  getStats as getMnemoriaStats,
  listDocuments as listMnemoriaDocuments,
  exportDocuments as exportMnemoriaDocuments,
  hasData
} from '../storage/mnemoria.js';

const log = createLogger();

export interface IngestOptions {
  output: string;
  label?: string;
  batchSize?: number;
  maxSizeMB?: number;
  memoryId?: string;
  memoryName?: string;
  enableEmbedding?: boolean;
  embeddingModel?: string;
}

export interface IngestStats {
  pages: number;
  bytes: number;
  duration: number;
  stoppedAtLimit?: boolean;
  skippedDupes?: number;
  memoryId?: string;
}

function getOutputDir(outputPath: string): string {
  if (outputPath.endsWith('.maw')) {
    return outputPath;
  }
  if (outputPath.endsWith('.mv2')) {
    return outputPath.replace(/\.mv2$/, '.maw');
  }
  return outputPath + '.maw';
}

export async function ingestToMv2(
  results: AsyncIterable<CrawlResult>,
  options: IngestOptions
): Promise<IngestStats> {
  const startTime = Date.now();
  const outputDir = getOutputDir(options.output);

  await ensureMnemoria(outputDir);

  let pages = 0;
  let totalBytes = 0;
  let skippedDupes = 0;
  const contentHashes = new Set<string>();
  const batchSize = options.batchSize || 5;
  const batch: Array<{
    title: string;
    text: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for await (const result of results) {
    const markdown = result.extracted.markdown;

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

    batch.push(doc);
    pages++;
    totalBytes += result.extracted.byteSize;

    log.progressUpdate(pages, result.extracted.title.slice(0, 40));

    if (batch.length >= batchSize) {
      log.progressUpdate(pages, `Saving ${batch.length} pages...`);
      await addDocuments(outputDir, batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    log.progressUpdate(pages, `Saving final ${batch.length} pages...`);
    await addDocuments(outputDir, batch);
  }

  // Rebuild search index after adding all documents
  log.progressUpdate(pages, 'Building search index...');
  const { runMnemoria } = await import('../storage/mnemoria.js');
  await runMnemoria(['rebuild-index'], { cwd: outputDir });

  log.progressEnd();

  const duration = Date.now() - startTime;

  return {
    pages,
    bytes: totalBytes,
    duration,
    stoppedAtLimit: false,
    skippedDupes,
  };
}

export interface GitIngestOptions {
  output: string;
  label?: string;
  memoryId?: string;
  memoryName?: string;
  enableEmbedding?: boolean;
  embeddingModel?: string;
  maxSizeMB?: number;
}

export interface GitIngestStats {
  files: number;
  bytes: number;
  duration: number;
  memoryId?: string;
  stoppedAtLimit?: boolean;
}

export async function ingestGitToMv2(
  files: AsyncIterable<{ path: string; content: string; language: string; size: number }>,
  options: GitIngestOptions
): Promise<GitIngestStats> {
  const startTime = Date.now();
  const outputDir = getOutputDir(options.output);

  await ensureMnemoria(outputDir);

  let fileCount = 0;
  let totalBytes = 0;
  const batchSize = 10;
  const batch: Array<{
    title: string;
    text: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }> = [];

  for await (const file of files) {
    const isReadme = /readme\.md$/i.test(file.path);
    const isDocs = /^(docs|documentation)\//i.test(file.path) || /\.(md|mdx|rst)$/i.test(file.path);

    let text = `File: ${file.path}\nLanguage: ${file.language}\n\n${file.content}`;

    if (isReadme) {
      const projectName = file.path.includes('/') ? '' : file.content.match(/^#\s+(.+)/m)?.[1] || '';
      text = `Project Overview: ${projectName}\nThis is the main README documentation.\n\n${text}`;
    }

    const doc = {
      title: `${file.path} (${file.language})`,
      label: options.label || 'code',
      text,
      metadata: {
        path: file.path,
        language: file.language,
        size: file.size,
        type: isReadme ? 'readme' : (isDocs ? 'docs' : 'code'),
        isReadme,
        ingestedAt: new Date().toISOString(),
      },
    };

    batch.push(doc);
    fileCount++;
    totalBytes += file.size;

    log.progressUpdate(fileCount, file.path.slice(-40));

    if (batch.length >= batchSize) {
      log.progressUpdate(fileCount, `Saving ${batch.length} files...`);
      await addDocuments(outputDir, batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    log.progressUpdate(fileCount, `Saving final ${batch.length} files...`);
    await addDocuments(outputDir, batch);
  }

  log.progressEnd();

  const duration = Date.now() - startTime;

  return {
    files: fileCount,
    bytes: totalBytes,
    duration,
    stoppedAtLimit: false,
  };
}

export async function getFileSize(path: string): Promise<number> {
  const outputDir = getOutputDir(path);
  
  if (!existsSync(outputDir)) {
    return 0;
  }

  try {
    const { readdirSync, statSync } = await import('fs');
    let totalSize = 0;
    
    function calculateDirSize(dir: string): void {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          calculateDirSize(fullPath);
        } else if (entry.isFile()) {
          totalSize += statSync(fullPath).size;
        }
      }
    }
    
    calculateDirSize(outputDir);
    return totalSize;
  } catch {
    return 0;
  }
}

export async function openMv2(path: string) {
  return {
    find: async (query: string, opts: { k?: number }) => {
      const outputDir = getOutputDir(path);
      const results = await searchDocuments(outputDir, query, opts.k || 10);
      return {
        hits: results.map(r => ({
          title: r.summary,
          preview: r.content.slice(0, 200),
          score: r.score,
        })),
      };
    },
    ask: async (question: string, opts: any) => {
      const outputDir = getOutputDir(path);
      return askQuestion(outputDir, question, {
        model: opts.model,
        apiKey: opts.modelApiKey,
      });
    },
    timeline: async (opts: { limit?: number }) => {
      const outputDir = getOutputDir(path);
      const docs = await listMnemoriaDocuments(outputDir, opts.limit || 100);
      return {
        frames: docs.map(d => ({
          title: d.summary,
          frame_id: d.id,
          entry_type: d.type,
        })),
      };
    },
  };
}

export async function searchMv2(
  path: string,
  query: string,
  options: { k?: number; embeddingModel?: string } = {}
) {
  const outputDir = getOutputDir(path);
  const results = await searchDocuments(outputDir, query, options.k || 10);

  return {
    hits: results.map(r => ({
      title: r.summary,
      preview: r.content.slice(0, 200),
      score: r.score,
      metadata: { url: '', type: r.entryType },
    })),
  };
}

function isOverviewQuestion(question: string): boolean {
  const lowerQ = question.toLowerCase();
  return (
    /^what (is|does|are)\b/.test(lowerQ) ||
    /^(explain|describe|tell me about)\b/.test(lowerQ) ||
    /^how does .+ work/.test(lowerQ) ||
    /overview|introduction|getting started/i.test(lowerQ)
  );
}

export async function askMv2(
  path: string,
  question: string,
  options: { model?: string; apiKey?: string; k?: number; embeddingModel?: string } = {}
) {
  const outputDir = getOutputDir(path);
  
  const isOverview = isOverviewQuestion(question);
  
  const result = await askQuestion(outputDir, question, {
    model: options.model,
    apiKey: options.apiKey,
  });

  return {
    answer: result.answer,
    sources: result.sources.map(s => ({ title: s })),
  };
}

export async function listMv2(
  path: string,
  options: { limit?: number; offset?: number } = {}
) {
  const outputDir = getOutputDir(path);
  const docs = await listMnemoriaDocuments(outputDir, options.limit || 100);

  return {
    frames: docs.map(d => ({
      title: d.summary,
      frame_id: d.id,
      entry_type: d.type,
    })),
  };
}

export async function exportMv2(
  path: string,
  options: { limit?: number } = {}
): Promise<Array<{ title: string; uri: string; content: string }>> {
  const outputDir = getOutputDir(path);
  return exportMnemoriaDocuments(outputDir, options.limit || 10000);
}
