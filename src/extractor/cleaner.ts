/**
 * HTML cleaner - removes unwanted elements before extraction
 */

import type { CheerioAPI } from 'cheerio';

// Elements to remove before extraction
const REMOVE_SELECTORS = [
  // Scripts and styles
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',

  // Navigation and layout
  'nav', 'header', 'footer', 'aside',
  '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]',
  '[role="complementary"]', '[role="menu"]', '[role="menubar"]',

  // Common class patterns for navigation/layout
  '.nav', '.navbar', '.navigation', '.header', '.footer', '.sidebar',
  '.menu', '.top-bar', '.bottom-bar', '.site-header', '.site-footer',
  '.page-header', '.page-footer', '.masthead',

  // Ads and tracking
  '.ad', '.ads', '.advertisement', '.advert', '.sponsored',
  '[class*="ad-"]', '[class*="ads-"]', '[id*="google_ads"]',
  '.tracking', '.analytics',

  // Popups and overlays
  '.popup', '.modal', '.overlay', '.lightbox', '.dialog',
  '.cookie-banner', '.cookie-consent', '.cookie-notice',
  '.gdpr', '.consent-banner',

  // Social and sharing
  '.social-share', '.share-buttons', '.share-links', '.social-links',
  '.follow-us', '.social-icons',

  // Comments
  '.comments', '.comment-section', '.comment-form', '#comments', '#disqus',
  '.discuss', '.discussion',

  // Related/recommended content
  '.related-posts', '.related-articles', '.recommended', '.suggestions',
  '.more-from', '.you-may-like', '.also-read',

  // Newsletter and subscriptions
  '.newsletter', '.subscribe', '.subscription', '.signup-form',
  '.email-signup', '.mailing-list',

  // Breadcrumbs and pagination
  '.breadcrumb', '.breadcrumbs', '.pagination', '.pager',

  // Author bio (usually after article)
  '.author-bio', '.author-box', '.about-author',

  // Hidden elements
  '[aria-hidden="true"]', '[hidden]', '.hidden', '.visually-hidden',
  '.screen-reader-text', '.sr-only',

  // Forms (except search)
  'form:not([role="search"])',

  // Print-only elements
  '.print-only', '.no-screen',
];

/**
 * Clean HTML by removing unwanted elements
 */
export function cleanHtml($: CheerioAPI): void {
  // Remove unwanted elements
  $(REMOVE_SELECTORS.join(', ')).remove();

  // Remove empty elements (but preserve br, hr, img, etc.)
  const preserveTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const $el = $(el);
    const tagName = el.tagName?.toLowerCase();

    if (preserveTags.has(tagName)) return;

    // Remove if empty (no children and no text)
    if (!$el.children().length && !$el.text().trim()) {
      $el.remove();
    }
  });

  // Remove data attributes (reduce noise, but keep data-language for code blocks)
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const attribs = el.attribs || {};
    Object.keys(attribs).forEach(attr => {
      if (attr.startsWith('data-') && attr !== 'data-language' && attr !== 'data-lang') {
        $(el).removeAttr(attr);
      }
    });
  });

  // Remove inline event handlers
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const attribs = el.attribs || {};
    Object.keys(attribs).forEach(attr => {
      if (attr.startsWith('on')) {
        $(el).removeAttr(attr);
      }
    });
  });

  // Remove style attributes
  $('[style]').removeAttr('style');

  // Remove class attributes (optional - can help reduce noise)
  // $('[class]').removeAttr('class');
}

/**
 * Extract the main content area if identifiable
 */
export function findMainContent($: CheerioAPI): string | null {
  // Priority order for main content
  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '#main-content',
    '#content',
    '.main-content',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.post-body',
    '.article-body',
  ];

  for (const selector of selectors) {
    const $el = $(selector).first();
    if ($el.length && $el.text().trim().length > 200) {
      return $el.html() || null;
    }
  }

  return null;
}
