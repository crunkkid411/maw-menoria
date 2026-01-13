/**
 * Web crawler with rate limiting
 */

import PQueue from 'p-queue';
import { EngineWaterfall, type EngineResult } from '../engine/index.js';
import { Extractor, type ExtractResult } from '../extractor/index.js';
import { RobotsParser } from './robots.js';
import { SitemapParser } from './sitemap.js';
import { createLogger } from '../utils/logger.js';
import { normalizeUrl, shouldSkipUrl, getBaseDomain } from '../utils/url.js';
import { DedupTracker } from '../utils/dedup.js';

export interface CrawlOptions {
  depth: number;
  concurrency: number;
  maxPages: number;
  rateLimit: number;
  timeout: number;
  respectRobots: boolean;
  useSitemap: boolean;
  includePattern?: RegExp;
  excludePattern?: RegExp;
  forceEngine?: 'fetch' | 'playwright' | 'rebrowser';
}

export interface CrawlResult {
  url: string;
  finalUrl: string;
  extracted: ExtractResult;
  depth: number;
  engine: string;
}

const DEFAULT_OPTIONS: CrawlOptions = {
  depth: 2,              // 2 levels deep (fast, good coverage)
  concurrency: 10,       // 10 concurrent requests
  maxPages: 150,         // 150 pages max (good coverage, avoids bloat)
  rateLimit: 10,         // 10 requests/sec
  timeout: 10000,        // 10s timeout (fail fast)
  respectRobots: true,
  useSitemap: true,
};

const log = createLogger();

export class Crawler {
  private options: CrawlOptions;
  private engine: EngineWaterfall;
  private extractor: Extractor;
  private robots: RobotsParser;
  private sitemap: SitemapParser;
  private dedup: DedupTracker;
  private visited: Set<string> = new Set();
  private queue: PQueue;
  private baseHosts: Set<string> = new Set();
  private results: CrawlResult[] = [];
  private pending: Map<string, { url: string; depth: number }> = new Map();

  constructor(options: Partial<CrawlOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.engine = new EngineWaterfall();
    this.extractor = new Extractor();
    this.robots = new RobotsParser();
    this.sitemap = new SitemapParser();
    this.dedup = new DedupTracker('en'); // Prefer English content

    // Rate-limited queue
    this.queue = new PQueue({
      concurrency: this.options.concurrency,
      interval: 1000,
      intervalCap: this.options.rateLimit,
    });
  }

  /**
   * Crawl URLs and yield results as they complete
   */
  async *crawl(startUrls: string[]): AsyncGenerator<CrawlResult> {
    const normalizedUrls = startUrls.map(u => normalizeUrl(u));
    this.baseHosts = new Set(normalizedUrls.map(u => getBaseDomain(u)));

    // Add start URLs FIRST (don't wait for sitemap)
    for (const url of normalizedUrls) {
      this.addToQueue(url, 0);
    }

    // Parse robots.txt (fast, ~1 request)
    if (this.options.respectRobots) {
      try {
        await Promise.race([
          Promise.all(normalizedUrls.map(url => this.robots.parse(url))),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch {
        // Timeout or error - continue without robots
      }
    }

    // Get URLs from sitemap (with 5s total timeout)
    if (this.options.useSitemap) {
      try {
        await Promise.race([
          this.parseSitemaps(normalizedUrls),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
      } catch {
        // Timeout - continue with what we have
      }
    }

    // Process queue and yield results with idle timeout
    let lastYieldTime = Date.now();
    let yieldedCount = 0;
    const idleTimeout = 15000; // 15 seconds without new results = done

    while (this.queue.size > 0 || this.queue.pending > 0 || this.results.length > 0) {
      // Yield available results
      while (this.results.length > 0) {
        yield this.results.shift()!;
        yieldedCount++;
        lastYieldTime = Date.now();
      }

      // Stop if we've hit maxPages
      if (yieldedCount >= this.options.maxPages) {
        break;
      }

      // Check for idle timeout (no new results for too long)
      if (Date.now() - lastYieldTime > idleTimeout) {
        break;
      }

      // Wait a bit for more results
      await new Promise(r => setTimeout(r, 50));
    }

    // Final results
    while (this.results.length > 0) {
      yield this.results.shift()!;
    }
  }

  private async parseSitemaps(urls: string[]): Promise<void> {
    for (const url of urls) {
      try {
        // Only try first sitemap from robots.txt
        const robotsSitemaps = this.robots.getSitemaps(url);
        let sitemapUrls: string[] = [];

        if (robotsSitemaps.length > 0) {
          // Just get first sitemap
          sitemapUrls = await this.sitemap.parseUrl(robotsSitemaps[0]);
        } else {
          sitemapUrls = await this.sitemap.parse(url);
        }

        // Add limited sitemap URLs
        const limit = Math.min(this.options.maxPages, 50);
        for (const sUrl of sitemapUrls.slice(0, limit)) {
          if (this.shouldCrawl(sUrl, 1)) {
            this.addToQueue(sUrl, 1);
          }
        }
      } catch {
        // No sitemap - continue
      }
    }
  }

  private addToQueue(url: string, depth: number): void {
    const normalized = normalizeUrl(url);

    if (this.visited.has(normalized)) return;
    if (this.visited.size >= this.options.maxPages) return;

    this.visited.add(normalized);

    this.queue.add(async () => {
      await this.processUrl(url, depth);
    });
  }

  private async processUrl(url: string, depth: number): Promise<void> {
    try {
      const result = await this.engine.fetch(url, {
        timeout: this.options.timeout,
        forceEngine: this.options.forceEngine,
      });

      if (result.blocked) {
        log.dim(`  Blocked: ${url}`);
        return;
      }

      if (result.statusCode >= 400) {
        log.dim(`  HTTP ${result.statusCode}: ${url}`);
        return;
      }

      const extracted = this.extractor.extract(result.html, result.finalUrl);

      // Skip pages with very little content
      if (extracted.wordCount < 20) {
        log.dim(`  Low content: ${url}`);
        return;
      }

      // Add to results
      this.results.push({
        url,
        finalUrl: result.finalUrl,
        extracted,
        depth,
        engine: result.engine,
      });

      // Queue discovered links
      if (depth < this.options.depth) {
        for (const link of extracted.links) {
          if (this.shouldCrawl(link, depth + 1)) {
            this.addToQueue(link, depth + 1);
          }
        }
      }
    } catch (error: any) {
      log.dim(`  Failed: ${url} - ${error.message}`);
    }
  }

  private shouldCrawl(url: string, depth: number): boolean {
    try {
      // Normalize
      const normalized = normalizeUrl(url);

      // Already visited
      if (this.visited.has(normalized)) return false;

      // Max pages
      if (this.visited.size >= this.options.maxPages) return false;

      // Depth check
      if (depth > this.options.depth) return false;

      // Skip non-HTML
      if (shouldSkipUrl(url)) return false;

      // Same domain only
      const domain = getBaseDomain(url);
      if (!this.baseHosts.has(domain)) return false;

      // Robots.txt
      if (this.options.respectRobots && !this.robots.isAllowed(url)) return false;

      // Include/exclude patterns
      if (this.options.includePattern && !this.options.includePattern.test(url)) return false;
      if (this.options.excludePattern && this.options.excludePattern.test(url)) return false;

      // Smart dedup - skip localized versions
      const dedupResult = this.dedup.shouldSkip(url);
      if (dedupResult.skip) {
        log.dim(`  Skip: ${url} (${dedupResult.reason})`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      ...this.engine.getStats(),
      visited: this.visited.size,
      queued: this.queue.size,
      pending: this.queue.pending,
      dedup: this.dedup.getStats(),
    };
  }

  /**
   * Close all resources
   */
  async close(): Promise<void> {
    this.queue.clear();
    await this.engine.close();
  }
}

export { RobotsParser } from './robots.js';
export { SitemapParser } from './sitemap.js';
