/**
 * Link extraction utilities
 */

import type { CheerioAPI } from 'cheerio';
import { resolveUrl, shouldSkipUrl } from '../utils/url.js';

export interface ExtractedLink {
  href: string;
  text: string;
  isInternal: boolean;
}

/**
 * Extract all links from HTML
 */
export function extractLinks($: CheerioAPI, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  try {
    const baseHost = new URL(baseUrl).hostname;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const resolved = resolveUrl(href, baseUrl);
      if (!resolved) return;

      // Skip non-HTML resources
      if (shouldSkipUrl(resolved)) return;

      // Deduplicate
      if (seen.has(resolved)) return;
      seen.add(resolved);

      links.push(resolved);
    });
  } catch {
    // Invalid base URL
  }

  return links;
}

/**
 * Extract links with additional metadata
 */
export function extractLinksWithMeta($: CheerioAPI, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  try {
    const baseHost = new URL(baseUrl).hostname;

    $('a[href]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (!href) return;

      const resolved = resolveUrl(href, baseUrl);
      if (!resolved) return;

      if (shouldSkipUrl(resolved)) return;

      if (seen.has(resolved)) return;
      seen.add(resolved);

      let isInternal = false;
      try {
        isInternal = new URL(resolved).hostname === baseHost;
      } catch {}

      links.push({
        href: resolved,
        text: $el.text().trim().slice(0, 100),
        isInternal,
      });
    });
  } catch {
    // Invalid base URL
  }

  return links;
}

/**
 * Extract only internal links (same domain)
 */
export function extractInternalLinks($: CheerioAPI, baseUrl: string): string[] {
  try {
    const baseHost = new URL(baseUrl).hostname;
    return extractLinks($, baseUrl).filter(link => {
      try {
        return new URL(link).hostname === baseHost;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
