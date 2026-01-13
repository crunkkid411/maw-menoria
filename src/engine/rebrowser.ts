/**
 * Stealth engine for anti-bot bypass
 * Uses playwright with stealth patches and human-like behavior
 * Lazy-loaded only when needed
 */

import type { Browser, BrowserContext, Page } from 'playwright';

let playwrightModule: typeof import('playwright') | null = null;

export interface RebrowserOptions {
  timeout?: number;
  userAgent?: string;
}

export class RebrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async fetch(url: string, options: RebrowserOptions = {}): Promise<{
    html: string;
    statusCode: number;
    finalUrl: string;
  }> {
    if (!playwrightModule) {
      playwrightModule = await import('playwright');
    }

    if (!this.browser) {
      // Use full browser with stealth settings
      this.browser = await playwrightModule.chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certifcate-errors',
        ],
      });

      this.context = await this.browser.newContext({
        userAgent: options.userAgent ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { latitude: 40.7128, longitude: -74.0060 },
        permissions: ['geolocation'],
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
      });

      // Add stealth scripts
      await this.context.addInitScript(() => {
        // Hide webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Fake plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Fake languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);

        // Hide automation indicators
        // @ts-ignore
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        // @ts-ignore
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        // @ts-ignore
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      });

      // Block heavy resources
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
      // Simulate human-like behavior
      await this.humanize(page);

      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: options.timeout || 30000,
      });

      // Wait for Cloudflare challenge if present
      await this.waitForChallenge(page);

      const html = await page.content();
      const statusCode = response?.status() || 200;
      const finalUrl = page.url();

      return { html, statusCode, finalUrl };
    } finally {
      await page.close();
    }
  }

  private async humanize(page: Page): Promise<void> {
    // Random mouse movements
    await page.mouse.move(
      100 + Math.random() * 500,
      100 + Math.random() * 300
    );

    // Random delay
    await page.waitForTimeout(500 + Math.random() * 1000);
  }

  private async waitForChallenge(page: Page): Promise<void> {
    // Wait for Cloudflare/other challenge to complete
    const challengeSelectors = [
      '#challenge-running',
      '.cf-browser-verification',
      '#challenge-form',
      '[data-testid="challenge-running"]',
      '.challenge-running',
    ];

    for (const selector of challengeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // Challenge detected, wait for it to resolve
          await page.waitForSelector(selector, {
            state: 'detached',
            timeout: 15000,
          });
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // Selector not found, continue
      }
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
