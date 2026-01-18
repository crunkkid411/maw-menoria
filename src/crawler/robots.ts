/**
 * Robots.txt parser
 */

interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export class RobotsParser {
  private rules: Map<string, RobotsRule[]> = new Map();
  private sitemaps: Map<string, string[]> = new Map();

  /**
   * Fetch and parse robots.txt for a URL
   */
  async parse(url: string): Promise<void> {
    try {
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.origin}/robots.txt`;
      const host = parsedUrl.hostname;

      // Already parsed
      if (this.rules.has(host)) return;

      const response = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'maw/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        // No robots.txt - allow everything
        this.rules.set(host, []);
        return;
      }

      const text = await response.text();
      this.parseRobotsTxt(host, text);
    } catch {
      // Failed to fetch - allow everything
      const host = new URL(url).hostname;
      this.rules.set(host, []);
    }
  }

  private parseRobotsTxt(host: string, text: string): void {
    const rules: RobotsRule[] = [];
    const sitemaps: string[] = [];
    let currentRule: RobotsRule | null = null;

    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const directive = trimmed.slice(0, colonIndex).toLowerCase().trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      switch (directive) {
        case 'user-agent':
          if (currentRule) {
            rules.push(currentRule);
          }
          currentRule = {
            userAgent: value.toLowerCase(),
            allow: [],
            disallow: [],
          };
          break;

        case 'allow':
          if (currentRule && value) {
            currentRule.allow.push(value);
          }
          break;

        case 'disallow':
          if (currentRule && value) {
            currentRule.disallow.push(value);
          }
          break;

        case 'crawl-delay':
          if (currentRule) {
            const delay = parseFloat(value);
            if (!isNaN(delay)) {
              currentRule.crawlDelay = delay;
            }
          }
          break;

        case 'sitemap':
          if (value) {
            sitemaps.push(value);
          }
          break;
      }
    }

    if (currentRule) {
      rules.push(currentRule);
    }

    this.rules.set(host, rules);
    this.sitemaps.set(host, sitemaps);
  }


  /**
   * Check if a URL is allowed by robots.txt
   * Follows Google's spec: longest matching pattern wins
   */
  isAllowed(url: string, userAgent = '*'): boolean {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname;
      const path = parsedUrl.pathname + parsedUrl.search;

      const hostRules = this.rules.get(host);
      if (!hostRules || hostRules.length === 0) {
        return true; // No rules = allow
      }

      // Find matching rules (specific user-agent or *)
      const matchingRules = hostRules.filter(
        r => r.userAgent === userAgent.toLowerCase() || r.userAgent === '*'
      );

      if (matchingRules.length === 0) {
        return true; // No matching rules = allow
      }

      // Collect ALL matching patterns from all rules
      const matches: { pattern: string; isAllow: boolean }[] = [];

      for (const rule of matchingRules) {
        // Collect matching allow patterns
        for (const allow of rule.allow) {
          if (this.pathMatches(path, allow)) {
            matches.push({ pattern: allow, isAllow: true });
          }
        }
        // Collect matching disallow patterns
        for (const disallow of rule.disallow) {
          if (this.pathMatches(path, disallow)) {
            matches.push({ pattern: disallow, isAllow: false });
          }
        }
      }

      // No matching patterns = allow
      if (matches.length === 0) {
        return true;
      }

      // Find the longest matching pattern (Google's spec: most specific wins)
      // If tied, allow wins (per spec: "allow" takes precedence on equal length)
      const longest = matches.reduce((best, current) => {
        if (current.pattern.length > best.pattern.length) {
          return current;
        }
        if (current.pattern.length === best.pattern.length && current.isAllow) {
          return current; // Allow wins on tie
        }
        return best;
      });

      return longest.isAllow;
    } catch {
      return true;
    }
  }


  /**
   * Get crawl delay for a host
   */
  getCrawlDelay(url: string, userAgent = '*'): number | undefined {
    try {
      const host = new URL(url).hostname;
      const hostRules = this.rules.get(host);

      if (!hostRules) return undefined;

      const rule = hostRules.find(
        r => r.userAgent === userAgent.toLowerCase() || r.userAgent === '*'
      );

      return rule?.crawlDelay;
    } catch {
      return undefined;
    }
  }

  /**
   * Get sitemaps declared in robots.txt
   */
  getSitemaps(url: string): string[] {
    try {
      const host = new URL(url).hostname;
      return this.sitemaps.get(host) || [];
    } catch {
      return [];
    }
  }

  private pathMatches(path: string, pattern: string): boolean {
    // Simple pattern matching (supports * and $ wildcards)
    if (pattern === '/') return true;

    // Convert pattern to regex
    let regex = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // * becomes .*

    // $ at end means exact match
    if (regex.endsWith('\\$')) {
      regex = regex.slice(0, -2) + '$';
    }

    try {
      return new RegExp('^' + regex).test(path);
    } catch {
      return path.startsWith(pattern);
    }
  }
}
