/**
 * Fast HTTP fetch engine - default for most sites
 */

export interface FetchOptions {
  timeout?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface FetchResult {
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  finalUrl: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export class FetchEngine {
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = options.timeout || 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': options.userAgent || DEFAULT_USER_AGENT,
          ...DEFAULT_HEADERS,
          ...options.headers,
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const html = await response.text();

      return {
        html,
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        finalUrl: response.url,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Timeout after ${timeout}ms`);
      }

      throw error;
    }
  }
}
