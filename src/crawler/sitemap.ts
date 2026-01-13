/**
 * Sitemap.xml parser using sitemapper
 */

import * as cheerio from 'cheerio';
import Sitemapper from 'sitemapper';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export class SitemapParser {
  private cache: Map<string, string[]> = new Map();
  private sitemapper: Sitemapper;

  constructor() {
    this.sitemapper = new Sitemapper({
      timeout: 10000,
      requestHeaders: {
        'User-Agent': 'maw/1.0 (sitemap crawler)',
      },
    });
  }

  /**
   * Parse sitemap for a URL and return all URLs
   */
  async parse(url: string): Promise<string[]> {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname;

      // Check cache
      if (this.cache.has(host)) {
        return this.cache.get(host)!;
      }

      const urls: string[] = [];

      // Try common sitemap locations
      const sitemapUrls = [
        `${parsedUrl.origin}/sitemap.xml`,
        `${parsedUrl.origin}/sitemap_index.xml`,
        `${parsedUrl.origin}/sitemap/sitemap.xml`,
      ];

      for (const sitemapUrl of sitemapUrls) {
        try {
          const sitemapContent = await this.fetchSitemap(sitemapUrl);
          if (sitemapContent) {
            const parsed = await this.parseSitemapContent(sitemapContent, parsedUrl.origin);
            urls.push(...parsed);
            if (urls.length > 0) break;
          }
        } catch {
          // Try next location
        }
      }

      this.cache.set(host, urls);
      return urls;
    } catch {
      return [];
    }
  }

  /**
   * Parse sitemap from a specific URL
   */
  async parseUrl(sitemapUrl: string): Promise<string[]> {
    try {
      const content = await this.fetchSitemap(sitemapUrl);
      if (!content) return [];

      const origin = new URL(sitemapUrl).origin;
      return this.parseSitemapContent(content, origin);
    } catch {
      return [];
    }
  }

  private async fetchSitemap(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'maw/1.0',
          'Accept': 'application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(5000), // 5s timeout - fail fast
      });

      if (!response.ok) return null;

      return await response.text();
    } catch {
      return null;
    }
  }

  private async parseSitemapContent(content: string, origin: string): Promise<string[]> {
    const urls: string[] = [];
    const MAX_URLS = 200; // Don't parse more than we need

    // Check if it's a sitemap index
    if (content.includes('<sitemapindex')) {
      const indexUrls = this.parseSitemapIndex(content);

      // Fetch only first 2 sub-sitemaps (speed over completeness)
      for (const indexUrl of indexUrls.slice(0, 2)) {
        if (urls.length >= MAX_URLS) break; // Early exit
        try {
          const subContent = await this.fetchSitemap(indexUrl);
          if (subContent) {
            const subUrls = this.parseUrlset(subContent);
            urls.push(...subUrls.slice(0, MAX_URLS - urls.length));
          }
        } catch {
          // Skip failed sitemaps
        }
      }
    } else {
      // Regular sitemap - limit to MAX_URLS
      const parsed = this.parseUrlset(content);
      urls.push(...parsed.slice(0, MAX_URLS));
    }

    return urls.slice(0, MAX_URLS);
  }

  private parseSitemapIndex(content: string): string[] {
    const $ = cheerio.load(content, { xmlMode: true });
    const urls: string[] = [];

    $('sitemap loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });

    return urls;
  }

  private parseUrlset(content: string): string[] {
    const $ = cheerio.load(content, { xmlMode: true });
    const urls: string[] = [];

    $('url loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });

    return urls;
  }

  /**
   * Parse sitemap for a URL and return all URLs with metadata
   * Uses sitemapper for robust parsing of sitemap indexes and news sitemaps
   */
  async parseWithMetadata(url: string): Promise<SitemapUrl[]> {
    try {
      const parsedUrl = new URL(url);
      const origin = parsedUrl.origin;

      // Try news sitemaps first (more recent content)
      const newsSitemapUrls = [
        `${origin}/sitemap/news.xml`,
        `${origin}/news-sitemap.xml`,
        `${origin}/sitemap-news.xml`,
        `${origin}/sitemaps/news.xml`,
      ];

      // Try news sitemaps first
      for (const sitemapUrl of newsSitemapUrls) {
        try {
          const content = await this.fetchSitemap(sitemapUrl);
          if (content && content.includes('<url')) {
            const urls = this.parseWithMeta(content);
            if (urls.length > 0) {
              return urls.slice(0, 1000);
            }
          }
        } catch {
          // Try next
        }
      }

      // Fall back to sitemapper for regular sitemaps
      const result = await this.sitemapper.fetch(`${origin}/sitemap.xml`);
      if (result.sites && result.sites.length > 0) {
        return result.sites.slice(0, 1000).map(loc => ({ loc }));
      }

      // Try sitemap index
      const indexResult = await this.sitemapper.fetch(`${origin}/sitemap_index.xml`);
      if (indexResult.sites && indexResult.sites.length > 0) {
        return indexResult.sites.slice(0, 1000).map(loc => ({ loc }));
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Parse sitemap with full metadata
   */
  parseWithMeta(content: string): SitemapUrl[] {
    const $ = cheerio.load(content, { xmlMode: true });
    const urls: SitemapUrl[] = [];

    $('url').each((_, el) => {
      const $el = $(el);
      const loc = $el.find('loc').text().trim();

      if (loc) {
        const entry: SitemapUrl = { loc };

        const lastmod = $el.find('lastmod').text().trim();
        if (lastmod) entry.lastmod = lastmod;

        const changefreq = $el.find('changefreq').text().trim();
        if (changefreq) entry.changefreq = changefreq;

        const priority = $el.find('priority').text().trim();
        if (priority) entry.priority = parseFloat(priority);

        urls.push(entry);
      }
    });

    return urls;
  }
}
