/**
 * Block detection heuristics for anti-bot systems
 */

export type BlockReason =
  | 'cloudflare'
  | 'datadome'
  | 'captcha'
  | 'rate_limit'
  | 'forbidden'
  | 'empty_body'
  | 'javascript_required'
  | 'access_denied';

export interface BlockCheck {
  blocked: boolean;
  reason?: BlockReason;
  confidence: number;
}

// Cloudflare challenge patterns
const CLOUDFLARE_PATTERNS = [
  /Checking your browser/i,
  /cf-browser-verification/i,
  /cloudflare/i,
  /_cf_chl_opt/,
  /challenge-platform/i,
  /Just a moment\.\.\./i,
  /ray id:/i,
  /cf-turnstile/i,
];

// DataDome patterns
const DATADOME_PATTERNS = [
  /datadome/i,
  /dd\.js/,
  /captcha-delivery\.com/,
  /geo\.captcha-delivery\.com/,
];

// PerimeterX / HUMAN patterns
const PERIMETERX_PATTERNS = [
  /perimeterx/i,
  /px-captcha/i,
  /_pxhd/,
  /human challenge/i,
];

// Akamai Bot Manager patterns
const AKAMAI_PATTERNS = [
  /akamai/i,
  /ak_bmsc/,
  /_abck/,
];

// Generic bot detection patterns
const BOT_DETECTION_PATTERNS = [
  /access denied/i,
  /please verify you are human/i,
  /enable javascript/i,
  /browser.*not supported/i,
  /automated access/i,
  /bot detected/i,
  /please complete the security check/i,
  /unusual traffic/i,
  /blocked/i,
  /forbidden/i,
  /not allowed/i,
];

// Captcha patterns
const CAPTCHA_PATTERNS = [
  /recaptcha/i,
  /hcaptcha/i,
  /g-recaptcha/,
  /h-captcha/,
  /captcha/i,
  /turnstile/i,
];

/**
 * Check if the response indicates blocking
 */
export function isBlocked(html: string, statusCode: number, url: string): BlockCheck {
  // Status code checks
  if (statusCode === 403) {
    return { blocked: true, reason: 'forbidden', confidence: 0.9 };
  }

  if (statusCode === 429) {
    return { blocked: true, reason: 'rate_limit', confidence: 0.95 };
  }

  if (statusCode === 503) {
    // Could be Cloudflare challenge or actual server error
    if (CLOUDFLARE_PATTERNS.some(p => p.test(html))) {
      return { blocked: true, reason: 'cloudflare', confidence: 0.95 };
    }
  }

  // Empty or minimal body
  if (!html || html.length < 500) {
    // Some pages are legitimately small, check for tell-tale signs
    if (html && (html.includes('challenge') || html.includes('captcha'))) {
      return { blocked: true, reason: 'empty_body', confidence: 0.7 };
    }
  }

  // Cloudflare
  const cfMatches = CLOUDFLARE_PATTERNS.filter(p => p.test(html));
  if (cfMatches.length >= 2) {
    return { blocked: true, reason: 'cloudflare', confidence: 0.9 };
  }

  // DataDome - only flag if page is SHORT (actual block pages are small)
  if (DATADOME_PATTERNS.filter(p => p.test(html)).length >= 2 && html.length < 50000) {
    return { blocked: true, reason: 'datadome', confidence: 0.9 };
  }

  // PerimeterX - only flag if page is short
  if (PERIMETERX_PATTERNS.some(p => p.test(html)) && html.length < 50000) {
    return { blocked: true, reason: 'access_denied', confidence: 0.85 };
  }

  // Akamai - only flag if page is short
  if (AKAMAI_PATTERNS.filter(p => p.test(html)).length >= 2 && html.length < 50000) {
    return { blocked: true, reason: 'access_denied', confidence: 0.8 };
  }

  // Captcha - only flag if the page is SHORT and has captcha patterns
  // Long pages with captcha are probably just forms, not block pages
  const captchaMatches = CAPTCHA_PATTERNS.filter(p => p.test(html)).length;
  if (captchaMatches >= 2 && html.length < 10000) {
    // Page is short with multiple captcha patterns - likely a challenge page
    return { blocked: true, reason: 'captcha', confidence: 0.85 };
  }

  // Generic bot detection - only if page is very short
  if (BOT_DETECTION_PATTERNS.some(p => p.test(html)) && html.length < 3000) {
    return { blocked: true, reason: 'access_denied', confidence: 0.7 };
  }

  // JavaScript required (no actual content)
  if (
    html.includes('noscript') &&
    (html.includes('enable javascript') || html.includes('JavaScript is required')) &&
    !html.includes('<article') &&
    !html.includes('<main') &&
    html.length < 5000
  ) {
    return { blocked: true, reason: 'javascript_required', confidence: 0.6 };
  }

  return { blocked: false, confidence: 0 };
}

// Known protected domains that typically need browser
const KNOWN_PROTECTED_DOMAINS = new Set([
  'linkedin.com',
  'instagram.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'indeed.com',
  'glassdoor.com',
  'zillow.com',
  'yelp.com',
]);

/**
 * Quick pre-check based on known protected domains
 */
export function needsBrowser(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');

    // Check exact match
    if (KNOWN_PROTECTED_DOMAINS.has(hostname)) {
      return true;
    }

    // Check if subdomain of protected domain
    for (const domain of KNOWN_PROTECTED_DOMAINS) {
      if (hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
