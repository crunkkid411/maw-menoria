/**
 * Playwright engine for JavaScript rendering
 * Lazy-loaded only when needed
 */

import type { Browser, BrowserContext } from 'playwright';

let playwrightModule: typeof import('playwright') | null = null;

/**
 * Check if playwright is installed
 */
export async function isPlaywrightInstalled(): Promise<boolean> {
  try {
    playwrightModule = await import('playwright');
    return true;
  } catch {
    return false;
  }
}

export interface PlaywrightOptions {
  timeout?: number;
  userAgent?: string;
}

export class PlaywrightEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async fetch(url: string, options: PlaywrightOptions = {}): Promise<{
    html: string;
    statusCode: number;
    finalUrl: string;
  }> {
    if (!playwrightModule) {
      playwrightModule = await import('playwright');
    }

    if (!this.browser) {
      this.browser = await playwrightModule.chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certifcate-errors',
          '--ignore-certifcate-errors-spki-list',
        ],
      });

      this.context = await this.browser.newContext({
        userAgent: options.userAgent ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
      });

      // Block unnecessary resources for speed
      await this.context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    const page = await this.context!.newPage();

    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: options.timeout || 15000,
      });

      // Wait a bit for dynamic content
      await page.waitForTimeout(1000);

      const html = await page.content();
      const statusCode = response?.status() || 200;
      const finalUrl = page.url();

      return { html, statusCode, finalUrl };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
