/**
 * Engine Waterfall - orchestrates fetch engines
 * Tries fast fetch first, escalates to browser only when blocked
 */

import { FetchEngine } from './fetch.js';
import { PlaywrightEngine, isPlaywrightInstalled } from './playwright.js';
import { RebrowserEngine } from './rebrowser.js';
import { isBlocked, needsBrowser, type BlockReason } from './detector.js';
import { createLogger } from '../utils/logger.js';

export interface EngineResult {
  html: string;
  statusCode: number;
  engine: 'fetch' | 'playwright' | 'rebrowser';
  blocked: boolean;
  blockReason?: BlockReason;
  finalUrl: string;
}

export interface EngineOptions {
  timeout?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  forceEngine?: 'fetch' | 'playwright' | 'rebrowser';
}

export interface EngineStats {
  fetch: number;
  playwright: number;
  rebrowser: number;
  blocked: number;
}

const log = createLogger();

type EngineName = 'fetch' | 'playwright' | 'rebrowser';

interface EngineConfig {
  name: EngineName;
  timeout: number;
  create: () => FetchEngine | PlaywrightEngine | RebrowserEngine;
}

// Engine priority order
const ENGINES: EngineConfig[] = [
  { name: 'fetch', timeout: 5000, create: () => new FetchEngine() },
  { name: 'playwright', timeout: 15000, create: () => new PlaywrightEngine() },
  { name: 'rebrowser', timeout: 30000, create: () => new RebrowserEngine() },
];

export class EngineWaterfall {
  private engines: Map<string, FetchEngine | PlaywrightEngine | RebrowserEngine> = new Map();
  private stats: EngineStats = { fetch: 0, playwright: 0, rebrowser: 0, blocked: 0 };
  private browserInstallPromise: Promise<boolean> | null = null;

  async fetch(url: string, options: EngineOptions = {}): Promise<EngineResult> {
    // Force specific engine if requested
    if (options.forceEngine) {
      return this.fetchWithEngine(url, options.forceEngine, options);
    }

    // Skip fetch for known protected sites
    const startIndex = needsBrowser(url) ? 1 : 0;
    const enginesToTry = ENGINES.slice(startIndex);

    // Try engines in order until success
    for (const engineConfig of enginesToTry) {
      try {
        const result = await this.fetchWithEngine(url, engineConfig.name, {
          ...options,
          timeout: options.timeout || engineConfig.timeout,
        });

        // Check if response looks blocked
        if (!result.blocked) {
          this.stats[engineConfig.name]++;
          return result;
        }

        log.dim(`  ${engineConfig.name} blocked: ${result.blockReason}`);
      } catch (error: any) {
        log.dim(`  ${engineConfig.name} failed: ${error.message}`);
      }
    }

    // All engines failed
    this.stats.blocked++;
    throw new Error(`All engines failed for ${url}`);
  }

  private async fetchWithEngine(
    url: string,
    engineName: EngineName,
    options: EngineOptions
  ): Promise<EngineResult> {
    // Lazy-load browser engines
    if (engineName === 'playwright' || engineName === 'rebrowser') {
      if (!await this.ensureBrowserInstalled()) {
        throw new Error('Browser not available');
      }
    }

    // Get or create engine instance
    let engine = this.engines.get(engineName);
    if (!engine) {
      const config = ENGINES.find(e => e.name === engineName);
      if (!config) throw new Error(`Unknown engine: ${engineName}`);
      engine = config.create();
      this.engines.set(engineName, engine);
    }

    // Fetch
    const result = await engine.fetch(url, options);

    // Detect blocking
    const blockCheck = isBlocked(result.html, result.statusCode, url);

    return {
      html: result.html,
      statusCode: result.statusCode,
      engine: engineName,
      blocked: blockCheck.blocked,
      blockReason: blockCheck.reason,
      finalUrl: result.finalUrl,
    };
  }

  private async ensureBrowserInstalled(): Promise<boolean> {
    if (await isPlaywrightInstalled()) {
      return true;
    }

    // Only show install prompt once
    if (!this.browserInstallPromise) {
      this.browserInstallPromise = this.installBrowser();
    }

    return this.browserInstallPromise;
  }

  private async installBrowser(): Promise<boolean> {
    log.info('\n  Protected site detected. Installing browser...');

    try {
      const { execSync } = await import('child_process');
      execSync('npx playwright install chromium', { stdio: 'inherit' });
      log.success('  Browser installed successfully.\n');
      return true;
    } catch (error) {
      log.error('  Failed to install browser. Some sites may not work.');
      return false;
    }
  }

  getStats(): EngineStats {
    return { ...this.stats };
  }

  async close(): Promise<void> {
    for (const engine of this.engines.values()) {
      if ('close' in engine && typeof engine.close === 'function') {
        await engine.close();
      }
    }
    this.engines.clear();
  }
}

export { isBlocked, needsBrowser } from './detector.js';
export type { BlockReason, BlockCheck } from './detector.js';
