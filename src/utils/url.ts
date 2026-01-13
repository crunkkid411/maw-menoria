/**
 * URL utilities for maw
 */

/**
 * Normalize a URL for deduplication
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);

    // Remove trailing slash
    let path = parsed.pathname;
    if (path.endsWith('/') && path !== '/') {
      path = path.slice(0, -1);
    }

    // Remove common tracking params
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_content');
    parsed.searchParams.delete('utm_term');
    parsed.searchParams.delete('ref');
    parsed.searchParams.delete('fbclid');
    parsed.searchParams.delete('gclid');

    // Remove hash
    parsed.hash = '';

    return `${parsed.origin}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Extract the base domain from a URL
 */
export function getBaseDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Check if a URL should be skipped (non-HTML resources)
 */
const SKIP_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dmg', '.pkg', '.deb', '.rpm',
  '.json', '.xml', '.yaml', '.yml', '.toml',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

export function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();

    // Skip non-HTML extensions
    for (const ext of SKIP_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        return true;
      }
    }

    // Skip mailto and javascript links
    if (url.startsWith('mailto:') || url.startsWith('javascript:') || url.startsWith('tel:')) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Resolve a relative URL against a base URL
 */
export function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    if (href.startsWith('#')) return null;
    if (href.startsWith('mailto:') || href.startsWith('javascript:') || href.startsWith('tel:')) {
      return null;
    }

    const base = new URL(baseUrl);
    return new URL(href, base.origin).href;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs are on the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const domain1 = getBaseDomain(url1);
    const domain2 = getBaseDomain(url2);
    return domain1 === domain2;
  } catch {
    return false;
  }
}
