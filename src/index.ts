/**
 * maw - Feed the maw. It never forgets.
 *
 * One command to consume entire websites, git repos, and files into searchable .mv2 files.
 */

import { Crawler, type CrawlOptions, type CrawlResult, SitemapParser } from './crawler/index.js';
import { ingestToMv2, ingestGitToMv2, getFileSize, searchMv2, askMv2, listMv2, exportMv2 } from './ingestor/index.js';
import { createLogger, setLogMode } from './utils/logger.js';
import { normalizeUrl } from './utils/url.js';
import { isGitUrl, isLocalGitRepo, readGitRepo } from './git/index.js';

export interface MawOptions {
  output: string;
  depth?: number;
  concurrency?: number;
  maxPages?: number;
  rateLimit?: number;
  timeout?: number;
  includePattern?: RegExp;
  excludePattern?: RegExp;
  useSitemap?: boolean;
  respectRobots?: boolean;
  forceEngine?: 'fetch' | 'playwright' | 'rebrowser';
  label?: string;
  memoryId?: string;  // Cloud memory ID to bind to (from dashboard)
  memoryName?: string; // Name for auto-created memory
  enableEmbedding?: boolean; // Enable semantic embeddings (slower but better search)
  embeddingModel?: string; // Embedding model: bge-small (default), openai, nvidia
  quiet?: boolean;
  verbose?: boolean;
}

export interface MawResult {
  output: string;
  pages: number;
  size: number;
  duration: number;
  stoppedAtLimit?: boolean;
  skippedDupes?: number;
  memoryId?: string; // Cloud memory ID (auto-created or provided)
  stats: {
    fetch: number;
    playwright: number;
    rebrowser: number;
    blocked: number;
    dedup: {
      localeSkipped: number;
      similarSkipped: number;
      total: number;
    };
  };
}

const log = createLogger();

/**
 * Check if URL is a specific page (not a domain root)
 * e.g., https://stripe.com/docs/api -> true (specific page)
 *       https://stripe.com/ -> false (domain root)
 *       https://stripe.com -> false (domain root)
 */
function isSpecificPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    // It's a specific page if path has content beyond just /
    // Ignore common index patterns like /index.html
    if (path === '/' || path === '') return false;
    if (path.match(/^\/(index\.(html?|php|aspx?)|default\.(html?|aspx?))$/i)) return false;
    // Has a meaningful path
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if input is a git repo (URL or local path)
 */
function isGitInput(input: string): boolean {
  return isGitUrl(input) || isLocalGitRepo(input);
}

/**
 * Main maw function - crawl URLs, git repos, or files and save to .mv2 file
 */
export async function maw(urls: string[], options: MawOptions): Promise<MawResult> {
  setLogMode(options.quiet || false, options.verbose || false);

  // Check if any input is a git repo
  const gitInputs = urls.filter(u => isGitInput(u));
  const webInputs = urls.filter(u => !isGitInput(u));

  // If we have git repos, handle them
  if (gitInputs.length > 0) {
    return mawGit(gitInputs, options);
  }

  // Auto-detect single page mode: if ALL urls are specific pages, use single-page mode
  const allSpecificPages = webInputs.every(u => isSpecificPage(u));
  const singlePageMode = allSpecificPages && options.depth === undefined;

  // Show mode indicator (CLI shows header, this adds context)
  if (!options.quiet) {
    if (singlePageMode) {
      log.info(`  Fetching ${webInputs.length} page${webInputs.length > 1 ? 's' : ''}...`);
    } else {
      log.info(`  Crawling (depth ${options.depth ?? 2}, max ${options.maxPages ?? 150} pages)...`);
    }
  }

  const crawler = new Crawler({
    // Single page mode: depth=0, maxPages=urls.length, no sitemap
    depth: singlePageMode ? 0 : (options.depth ?? 2),
    concurrency: options.concurrency ?? 10,
    maxPages: singlePageMode ? webInputs.length : (options.maxPages ?? 150),
    rateLimit: options.rateLimit ?? 10,
    timeout: options.timeout ?? 10000,
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
    useSitemap: singlePageMode ? false : (options.useSitemap ?? true),
    respectRobots: options.respectRobots ?? true,
    forceEngine: options.forceEngine,
  });

  try {
    // Crawl and ingest
    const crawlResults = crawler.crawl(webInputs);

    // Generate memory name from URLs if not provided
    const memoryName = options.memoryName || webInputs.map(u => {
      try { return new URL(u).hostname.replace('www.', ''); } catch { return u; }
    }).join('-');

    const ingestStats = await ingestToMv2(crawlResults, {
      output: options.output,
      label: options.label,
      memoryId: options.memoryId,
      memoryName,
      enableEmbedding: options.enableEmbedding,
      embeddingModel: options.embeddingModel,
    });

    // Get final stats
    const engineStats = crawler.getStats();
    const fileSize = await getFileSize(options.output);

    return {
      output: options.output,
      pages: ingestStats.pages,
      size: fileSize,
      duration: ingestStats.duration,
      stoppedAtLimit: ingestStats.stoppedAtLimit,
      skippedDupes: ingestStats.skippedDupes,
      memoryId: ingestStats.memoryId,
      stats: {
        fetch: engineStats.fetch,
        playwright: engineStats.playwright,
        rebrowser: engineStats.rebrowser,
        blocked: engineStats.blocked,
        dedup: engineStats.dedup || { localeSkipped: 0, similarSkipped: 0, total: 0 },
      },
    };
  } finally {
    await crawler.close();
  }
}

/**
 * Ingest git repos into .mv2 file
 */
async function mawGit(repos: string[], options: MawOptions): Promise<MawResult> {
  const startTime = Date.now();

  if (!options.quiet) {
    log.info(`  Reading ${repos.length} repo${repos.length > 1 ? 's' : ''}...`);
  }

  // Generate memory name from repo names
  const memoryName = options.memoryName || repos.map(r => {
    const match = r.match(/\/([^/]+?)(\.git)?$/);
    return match ? match[1] : r.split('/').pop() || 'repo';
  }).join('-');

  // Read all git repos
  const allFiles = readGitRepo(repos[0]); // For now, handle one repo at a time

  const ingestStats = await ingestGitToMv2(allFiles, {
    output: options.output,
    label: options.label || 'code',
    memoryId: options.memoryId,
    memoryName,
    enableEmbedding: options.enableEmbedding,
    embeddingModel: options.embeddingModel,
  });

  const fileSize = await getFileSize(options.output);
  const duration = Date.now() - startTime;

  return {
    output: options.output,
    pages: ingestStats.files,
    size: fileSize,
    duration,
    stoppedAtLimit: ingestStats.stoppedAtLimit,
    memoryId: ingestStats.memoryId,
    stats: {
      fetch: ingestStats.files,
      playwright: 0,
      rebrowser: 0,
      blocked: 0,
      dedup: { localeSkipped: 0, similarSkipped: 0, total: ingestStats.files },
    },
  };
}

/**
 * Search in an .mv2 file
 */
export async function find(path: string, query: string, options: { k?: number } = {}) {
  return searchMv2(path, query, options);
}

/**
 * Ask a question using an .mv2 file
 */
export async function ask(
  path: string,
  question: string,
  options: { model?: string; apiKey?: string; k?: number } = {}
) {
  return askMv2(path, question, options);
}

/**
 * List documents in an .mv2 file
 */
export async function list(path: string, options: { limit?: number } = {}) {
  return listMv2(path, options);
}

/**
 * Export documents from an .mv2 file with full content
 */
export async function exportDocs(path: string, options: { limit?: number } = {}) {
  return exportMv2(path, options);
}

export interface PreviewResult {
  domain: string;
  totalPages: number;
  hasSitemap: boolean;
  estimatedSize?: string;
  recentPages: Array<{ url: string; lastmod?: string }>;
}

/**
 * Preview available pages on a site (sitemap discovery)
 */
export async function preview(url: string, options: { limit?: number } = {}): Promise<PreviewResult> {
  const normalized = normalizeUrl(url);
  const parsedUrl = new URL(normalized);
  const domain = parsedUrl.hostname;

  const sitemap = new SitemapParser();
  const pages = await sitemap.parseWithMetadata(normalized);

  // Sort by lastmod (most recent first)
  const sortedPages = pages.sort((a, b) => {
    if (!a.lastmod && !b.lastmod) return 0;
    if (!a.lastmod) return 1;
    if (!b.lastmod) return -1;
    return new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime();
  });

  const limit = options.limit || 20;
  const recentPages = sortedPages.slice(0, limit).map(p => ({
    url: p.loc,
    lastmod: p.lastmod,
  }));

  // Estimate size (~300KB average per page for news sites, ~100KB for docs)
  const avgPageSize = domain.includes('cnn') || domain.includes('news') ? 300 : 100;
  const estimatedMB = (pages.length * avgPageSize) / 1024;
  const estimatedSize = estimatedMB < 50
    ? `${estimatedMB.toFixed(0)}MB (fits in free tier)`
    : `${estimatedMB.toFixed(0)}MB (needs API key for full crawl)`;

  return {
    domain,
    totalPages: pages.length,
    hasSitemap: pages.length > 0,
    estimatedSize: pages.length > 0 ? estimatedSize : undefined,
    recentPages,
  };
}

// Export types and utilities
export type { CrawlOptions, CrawlResult } from './crawler/index.js';
export type { ExtractResult } from './extractor/index.js';
export type { EngineResult, EngineOptions, EngineStats } from './engine/index.js';
export { Crawler } from './crawler/index.js';
export { Extractor } from './extractor/index.js';
export { EngineWaterfall } from './engine/index.js';
export { createLogger, setLogMode } from './utils/logger.js';
