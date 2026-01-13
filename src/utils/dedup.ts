/**
 * Smart duplicate detection for web crawling
 * - Detects localized URLs (e.g., /en-us/, /de-de/, /fr-fr/)
 * - Content similarity fingerprinting
 * - URL path normalization
 */

// Common locale patterns in URLs
const LOCALE_PATTERNS = [
  // ISO codes: en-us, de-de, fr-fr, pt-br, zh-cn
  /\/([a-z]{2}-[a-z]{2})\//i,
  // Short codes: /en/, /de/, /fr/
  /\/([a-z]{2})\/(?=[a-z])/i,
  // Subdomain: en.example.com, de.example.com
  /^https?:\/\/([a-z]{2})\./i,
  // Query param: ?lang=en, ?locale=de-DE
  /[?&](lang|locale|hl|language)=([a-z]{2}(-[a-z]{2})?)/i,
];

// Known language codes (ISO 639-1)
const LANGUAGE_CODES = new Set([
  // Major world languages
  'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'tr', 'vi', 'th', 'id', 'ms', 'sv', 'no', 'da', 'fi', 'cs',
  'el', 'he', 'hu', 'ro', 'sk', 'uk', 'bg', 'hr', 'lt', 'lv', 'et', 'sl',
  // Indian languages
  'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur',
  // Asian languages
  'km', 'lo', 'ne', 'si', 'tl', 'mn', 'fa', 'ps',
  // European languages
  'sq', 'mk', 'sr', 'bs', 'is', 'mt', 'cy', 'ga', 'eu', 'gl',
  // African languages
  'sw', 'am', 'af', 'ha', 'yo', 'ig', 'zu',
  // Central Asian
  'az', 'uz', 'kk', 'ka', 'hy', 'tg',
]);

// Known country codes (ISO 3166-1 alpha-2)
const COUNTRY_CODES = new Set([
  // North America & Europe
  'us', 'gb', 'uk', 'ca', 'au', 'nz', 'ie', 'de', 'at', 'ch', 'fr', 'be',
  'es', 'it', 'pt', 'nl', 'pl', 'ru', 'se', 'no', 'dk', 'fi', 'cz', 'gr',
  'hu', 'ro', 'sk', 'ua', 'bg', 'hr', 'rs', 'si', 'lt', 'lv', 'ee',
  // Asia Pacific
  'jp', 'kr', 'cn', 'tw', 'hk', 'sg', 'my', 'th', 'vn', 'ph', 'mm', 'kh',
  'la', 'np', 'lk', 'bd', 'pk',
  // Middle East & North Africa
  'in', 'ae', 'sa', 'il', 'eg', 'ma', 'dz', 'tn', 'lb', 'jo', 'kw', 'qa',
  'bh', 'om', 'iq', 'ir', 'tr',
  // Africa
  'za', 'ng', 'ke', 'gh', 'tz', 'ug', 'et', 'sn', 'ci',
  // Latin America
  'mx', 'ar', 'br', 'co', 'cl', 'pe', 'ec', 've', 'bo', 'py', 'uy',
  'cr', 'pa', 'gt', 'hn', 'ni', 'cu', 'do', 'pr', 'jm',
]);

export interface LocaleInfo {
  hasLocale: boolean;
  locale?: string;
  language?: string;
  country?: string;
  canonicalPath: string;
}

/**
 * Extract locale information from a URL
 */
export function extractLocale(url: string): LocaleInfo {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    let locale: string | undefined;
    let language: string | undefined;
    let country: string | undefined;

    // Check for locale in path (most common patterns)
    // Match: /en-us/, /de-de/, /fr/, /jp/, /zh-cn/, /mx/, /br/, etc.
    // Also match: /en_US/, /de_DE/ (underscore variant)
    const pathMatch = path.match(/^\/([a-z]{2})([-_]([a-z]{2}))?(?=\/|$)/i);
    if (pathMatch) {
      const first = pathMatch[1].toLowerCase();
      const second = pathMatch[3]?.toLowerCase();

      // Check if first segment is a language OR country code (Stripe uses /jp/, /mx/, /br/)
      const isLanguage = LANGUAGE_CODES.has(first);
      const isCountry = COUNTRY_CODES.has(first);

      if (isLanguage || isCountry) {
        if (isLanguage) {
          language = first;
        } else {
          country = first;
        }

        if (second && COUNTRY_CODES.has(second)) {
          country = second;
          locale = `${first}-${second}`;
        } else if (second && LANGUAGE_CODES.has(second)) {
          // Some sites use /de-de/ where second part is also a language code
          country = second;
          locale = `${first}-${second}`;
        } else {
          locale = first;
        }
        // Remove locale from path for canonical
        path = path.replace(/^\/[a-z]{2}([-_][a-z]{2})?/i, '') || '/';
      }
    }

    // Also check for locale anywhere in path (not just at start)
    // Pattern: /site/jp/pricing, /docs/es/guide
    if (!locale) {
      const midPathMatch = path.match(/\/([a-z]{2})([-_]([a-z]{2}))?(?=\/)/i);
      if (midPathMatch) {
        const first = midPathMatch[1].toLowerCase();
        const second = midPathMatch[3]?.toLowerCase();

        // Treat as locale if it's a known language OR country code
        // Exclude common false positives that are English words
        const isLanguage = LANGUAGE_CODES.has(first);
        const isCountry = COUNTRY_CODES.has(first);
        const isFalsePositive = [
          'us', 'uk', 'my', 'in', 'at', 'be', 'to', 'do', 'go', 'so', 'no', 'id',  // original
          'am', 'is', 'it', 'me', 'or', 'as', 'if', 'an', 'on', 'up',              // common English words
          'la', 'ha', 'pa', 'om',                                                   // filler/informal
        ].includes(first);

        if ((isLanguage || isCountry) && !isFalsePositive) {
          if (isLanguage) {
            language = first;
          } else {
            country = first;
          }
          if (second && COUNTRY_CODES.has(second)) {
            country = second;
            locale = `${first}-${second}`;
          } else {
            locale = first;
          }
          // Remove locale segment from path
          path = path.replace(/\/[a-z]{2}([-_][a-z]{2})?(?=\/)/i, '');
        }
      }
    }

    // Check query params for locale
    const langParam = parsed.searchParams.get('lang') ||
                      parsed.searchParams.get('locale') ||
                      parsed.searchParams.get('hl') ||
                      parsed.searchParams.get('language');
    if (langParam && !locale) {
      const parts = langParam.toLowerCase().split(/[-_]/);
      if (LANGUAGE_CODES.has(parts[0])) {
        language = parts[0];
        if (parts[1] && COUNTRY_CODES.has(parts[1])) {
          country = parts[1];
          locale = `${parts[0]}-${parts[1]}`;
        } else {
          locale = parts[0];
        }
      }
    }

    // Remove locale-related query params for canonical path
    parsed.searchParams.delete('lang');
    parsed.searchParams.delete('locale');
    parsed.searchParams.delete('hl');
    parsed.searchParams.delete('language');

    const queryString = parsed.searchParams.toString();
    const canonicalPath = path + (queryString ? `?${queryString}` : '');

    return {
      hasLocale: !!locale,
      locale,
      language,
      country,
      canonicalPath,
    };
  } catch {
    return {
      hasLocale: false,
      canonicalPath: url,
    };
  }
}

/**
 * Generate a content fingerprint for similarity detection
 * Uses multiple techniques for robust matching
 */
export function generateFingerprint(text: string): string {
  // Normalize text
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();

  // Take key portions: start, middle, end
  const len = normalized.length;
  if (len < 500) {
    return normalized;
  }

  // Sample from different parts of the document
  const start = normalized.slice(0, 300);
  const middle = normalized.slice(Math.floor(len / 2) - 150, Math.floor(len / 2) + 150);
  const end = normalized.slice(-300);

  return `${start}|${middle}|${end}`;
}

/**
 * Calculate similarity between two fingerprints (0-1)
 */
export function calculateSimilarity(fp1: string, fp2: string): number {
  if (fp1 === fp2) return 1;
  if (!fp1 || !fp2) return 0;

  // Use Jaccard similarity on word sets
  const words1 = new Set(fp1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(fp2.split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return intersection / union;
}

/**
 * Smart deduplication tracker
 */
export class DedupTracker {
  // Track canonical paths we've seen (locale-stripped)
  private canonicalPaths = new Map<string, { url: string; locale?: string }>();

  // Track content fingerprints
  private fingerprints = new Map<string, string>();

  // Stats
  public stats = {
    localeSkipped: 0,
    similarSkipped: 0,
    total: 0,
  };

  // Preferred language (skip other locales if we have this one)
  private preferredLanguage: string;

  constructor(preferredLanguage = 'en') {
    this.preferredLanguage = preferredLanguage;
  }

  /**
   * Check if URL should be skipped (is duplicate)
   * Returns reason if should skip, undefined if should crawl
   */
  shouldSkip(url: string): { skip: boolean; reason?: string } {
    const localeInfo = extractLocale(url);
    const domain = new URL(url).hostname;
    const key = `${domain}${localeInfo.canonicalPath}`;

    // Check if we've seen this canonical path
    const existing = this.canonicalPaths.get(key);
    if (existing) {
      // We have this path already
      if (localeInfo.hasLocale) {
        // This is a localized version
        const existingLocale = extractLocale(existing.url);

        // Prefer English or non-localized over other locales
        if (existingLocale.language === this.preferredLanguage || !existingLocale.hasLocale) {
          this.stats.localeSkipped++;
          return { skip: true, reason: `locale:${localeInfo.locale}` };
        }

        // If this one is preferred language and existing isn't, replace
        if (localeInfo.language === this.preferredLanguage) {
          this.canonicalPaths.set(key, { url, locale: localeInfo.locale });
          return { skip: false };
        }

        // Both are non-preferred locales, skip this one
        this.stats.localeSkipped++;
        return { skip: true, reason: `locale:${localeInfo.locale}` };
      }
    }

    // Track this path
    this.canonicalPaths.set(key, { url, locale: localeInfo.locale });
    this.stats.total++;
    return { skip: false };
  }

  /**
   * Check content similarity against previously seen content
   */
  checkContentSimilarity(url: string, content: string, threshold = 0.85): { skip: boolean; reason?: string } {
    const fingerprint = generateFingerprint(content);

    // Check against existing fingerprints
    for (const [existingUrl, existingFp] of this.fingerprints) {
      const similarity = calculateSimilarity(fingerprint, existingFp);
      if (similarity >= threshold) {
        this.stats.similarSkipped++;
        return { skip: true, reason: `similar:${(similarity * 100).toFixed(0)}%` };
      }
    }

    // Store this fingerprint
    this.fingerprints.set(url, fingerprint);
    return { skip: false };
  }

  /**
   * Get dedup statistics
   */
  getStats() {
    return {
      ...this.stats,
      uniquePaths: this.canonicalPaths.size,
      uniqueContent: this.fingerprints.size,
    };
  }
}
