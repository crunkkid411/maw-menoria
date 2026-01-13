/**
 * Content extraction pipeline
 * Uses Readability for main content extraction + node-html-markdown for conversion
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { cleanHtml, findMainContent } from './cleaner.js';
import { extractLinks } from './links.js';
import { htmlToMarkdown } from './markdown.js';

export interface ExtractResult {
  title: string;
  markdown: string;
  description: string;
  author: string | null;
  publishedDate: string | null;
  links: string[];
  wordCount: number;
  byteSize: number;
}

export interface ExtractOptions {
  includeLinks?: boolean;
  maxContentLength?: number;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  includeLinks: true,
  maxContentLength: 500000, // 500KB max content
};

export class Extractor {
  extract(html: string, url: string, options: ExtractOptions = {}): ExtractResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const $ = cheerio.load(html);

    // Extract metadata before cleaning
    const title = this.extractTitle($, url);
    const description = this.extractDescription($);
    const author = this.extractAuthor($);
    const publishedDate = this.extractDate($);
    const links = opts.includeLinks ? extractLinks($, url) : [];

    // Clean HTML
    cleanHtml($);

    // Try Readability first for article extraction
    let markdown: string;
    try {
      const cleanedHtml = $.html();
      const dom = new JSDOM(cleanedHtml, { url });
      const reader = new Readability(dom.window.document, {
        charThreshold: 50,
      });
      const article = reader.parse();

      if (article?.content && article.textContent && article.textContent.length > 100) {
        // Use node-html-markdown (faster than Turndown)
        markdown = htmlToMarkdown(article.content);

        // Use Readability's title if better
        if (article.title && article.title.length > title.length) {
          // title = article.title; // Uncomment if preferred
        }
      } else {
        // Fallback: try to find main content area
        const mainContent = findMainContent($);
        if (mainContent) {
          markdown = htmlToMarkdown(mainContent);
        } else {
          // Last resort: convert body
          markdown = htmlToMarkdown($('body').html() || cleanedHtml);
        }
      }
    } catch {
      // Fallback if Readability fails
      markdown = htmlToMarkdown($.html());
    }

    // Truncate if too long
    if (opts.maxContentLength && markdown.length > opts.maxContentLength) {
      markdown = markdown.slice(0, opts.maxContentLength) + '\n\n[Content truncated...]';
    }

    const wordCount = markdown.split(/\s+/).filter(Boolean).length;

    return {
      title,
      markdown,
      description,
      author,
      publishedDate,
      links,
      wordCount,
      byteSize: Buffer.byteLength(markdown, 'utf8'),
    };
  }

  private extractTitle($: cheerio.CheerioAPI, url: string): string {
    const sources = [
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="twitter:title"]').attr('content'),
      $('title').text(),
      $('h1').first().text(),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        // Remove site name suffix (e.g., "Page Title | Site Name")
        const cleaned = source.split(/\s*[|\-–—]\s*/)[0].trim();
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }

    // Fallback to URL path
    try {
      const pathname = new URL(url).pathname;
      if (pathname && pathname !== '/') {
        return pathname
          .replace(/\/$/, '')
          .split('/')
          .pop()!
          .replace(/[-_]/g, ' ')
          .replace(/\.\w+$/, '');
      }
    } catch {}

    return url;
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    const sources = [
      $('meta[property="og:description"]').attr('content'),
      $('meta[name="description"]').attr('content'),
      $('meta[name="twitter:description"]').attr('content'),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        return source.slice(0, 300);
      }
    }

    return '';
  }

  private extractAuthor($: cheerio.CheerioAPI): string | null {
    const sources = [
      $('meta[name="author"]').attr('content'),
      $('meta[property="article:author"]').attr('content'),
      $('[rel="author"]').first().text(),
      $('[itemprop="author"]').first().text(),
      $('.author').first().text(),
      $('[class*="author-name"]').first().text(),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        return source.trim().slice(0, 100);
      }
    }

    return null;
  }

  private extractDate($: cheerio.CheerioAPI): string | null {
    const sources = [
      $('meta[property="article:published_time"]').attr('content'),
      $('meta[name="date"]').attr('content'),
      $('meta[name="publish-date"]').attr('content'),
      $('time[datetime]').attr('datetime'),
      $('[itemprop="datePublished"]').attr('content'),
      $('[itemprop="datePublished"]').attr('datetime'),
    ];

    for (const source of sources) {
      if (source?.trim()) {
        try {
          const date = new Date(source);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch {}
      }
    }

    return null;
  }
}

export { cleanHtml, findMainContent } from './cleaner.js';
export { extractLinks, extractInternalLinks, extractLinksWithMeta } from './links.js';
export { htmlToMarkdown, markdownToPlainText } from './markdown.js';
