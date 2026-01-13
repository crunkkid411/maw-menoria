/**
 * Beautiful terminal UI for maw
 * Clean, minimal, production-ready
 */

import chalk from 'chalk';

// Theme colors - refined palette
const theme = {
  primary: chalk.hex('#a78bfa'),     // Soft violet
  success: chalk.hex('#34d399'),     // Mint green
  warning: chalk.hex('#fbbf24'),     // Golden
  error: chalk.hex('#f87171'),       // Soft red
  muted: chalk.hex('#9ca3af'),       // Gray
  accent: chalk.hex('#60a5fa'),      // Sky blue
  info: chalk.hex('#38bdf8'),        // Cyan
  dim: chalk.dim,
  bold: chalk.bold,
  white: chalk.white,
};

// Icons
const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  arrow: '→',
  bullet: '•',
  page: '◉',
  folder: '◈',
};

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format duration to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Truncate URL for display
 */
function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    // Show host + truncated path
    const availableForPath = maxLen - host.length - 5;
    if (availableForPath > 10) {
      return `${host}/...${path.slice(-availableForPath)}`;
    }
    return url.slice(0, maxLen - 3) + '...';
  } catch {
    return url.slice(0, maxLen - 3) + '...';
  }
}

/**
 * Create a smooth progress bar
 */
export function progressBar(current: number, total: number, width = 24): string {
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const filledBar = theme.primary('━'.repeat(filled));
  const emptyBar = theme.muted('─'.repeat(empty));

  return filledBar + emptyBar;
}

/**
 * Clean header - no box, just styled text
 */
export function header(title: string, subtitle?: string): string {
  const lines: string[] = [''];

  lines.push(`  ${theme.primary.bold(title)}`);

  if (subtitle) {
    // Truncate long URLs
    const display = truncateUrl(subtitle, 70);
    lines.push(`  ${theme.muted(display)}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Crawl progress line - clean and minimal
 */
export function crawlProgress(current: number, total: number, title: string, status?: string): string {
  const bar = progressBar(current, Math.max(total, current), 20);
  const count = theme.muted(`${current}/${total}`);
  const titleTrunc = title.length > 50 ? title.slice(0, 47) + '...' : title;

  return `\n  ${bar} ${count}\n  ${theme.white(titleTrunc)}`;
}

/**
 * Success message - clean layout
 */
export function successMessage(output: string, size: number, pages: number, duration: number): string {
  const lines: string[] = [''];

  // Success line
  lines.push(`  ${theme.success(icons.success)} ${theme.success.bold(output)}`);
  lines.push('');

  // Stats in a clean row
  const stats = [
    `${theme.muted('Size')} ${theme.accent.bold(formatBytes(size))}`,
    `${theme.muted('Pages')} ${theme.accent.bold(pages.toString())}`,
    `${theme.muted('Time')} ${theme.accent.bold(formatDuration(duration))}`,
  ].join('    ');

  lines.push(`  ${stats}`);

  return lines.join('\n');
}

/**
 * Engine stats display
 */
export function engineStats(stats: { fetch: number; playwright: number; rebrowser: number; blocked: number }): string {
  const parts = [
    stats.fetch > 0 ? theme.success(`fetch ${stats.fetch}`) : null,
    stats.playwright > 0 ? theme.info(`browser ${stats.playwright}`) : null,
    stats.rebrowser > 0 ? theme.warning(`stealth ${stats.rebrowser}`) : null,
    stats.blocked > 0 ? theme.error(`blocked ${stats.blocked}`) : null,
  ].filter(Boolean);

  if (parts.length === 0) return '';
  return `\n  ${theme.muted('Engines:')} ${parts.join(theme.muted(' · '))}`;
}

/**
 * Dedup stats display
 */
export function dedupStats(stats: { localeSkipped: number; similarSkipped: number; total: number }): string {
  if (stats.localeSkipped === 0 && stats.similarSkipped === 0) return '';

  const parts = [];
  if (stats.localeSkipped > 0) {
    parts.push(`${stats.localeSkipped} locales`);
  }
  if (stats.similarSkipped > 0) {
    parts.push(`${stats.similarSkipped} similar`);
  }

  return `\n  ${theme.muted('Skipped:')} ${theme.info(parts.join(', '))}`;
}

/**
 * Warning message for size limit
 */
export function limitWarning(): string {
  const lines: string[] = [''];
  lines.push(`  ${theme.warning(icons.warning)} ${theme.warning('Stopped at free tier limit (~50MB)')}`);
  lines.push(`  ${theme.muted('Set MEMVID_API_KEY for unlimited crawling')}`);
  lines.push(`  ${theme.muted('Get your key:')} ${theme.info('https://memvid.com/dashboard/api')}`);
  return lines.join('\n');
}

/**
 * Cloud sync message
 */
export function cloudSyncMessage(memoryId: string): string {
  const dashboardUrl = process.env.MEMVID_DASHBOARD_URL || 'https://memvid.com';
  return `\n  ${theme.muted('Synced:')} ${theme.info(`${dashboardUrl}/memories/${memoryId}`)}`;
}

/**
 * Error message
 */
export function errorMessage(message: string): string {
  return `\n  ${theme.error(icons.error)} ${theme.error(message)}\n`;
}

/**
 * Maw banner - minimal and clean
 */
export function banner(): string {
  return `
  ${theme.primary.bold('maw')} ${theme.muted('— Feed the maw. It never forgets.')}
`;
}

/**
 * Preview results display
 */
export function previewResults(result: {
  domain: string;
  totalPages: number;
  hasSitemap: boolean;
  estimatedSize?: string;
  recentPages: Array<{ url: string; lastmod?: string }>;
}): string {
  const lines: string[] = [''];

  lines.push(`  ${theme.primary.bold(result.domain)}`);
  lines.push(`  ${theme.muted(`${result.totalPages.toLocaleString()} pages in sitemap`)}`);

  if (result.estimatedSize) {
    lines.push(`  ${theme.muted('Est. size:')} ${theme.accent(result.estimatedSize)}`);
  }

  if (result.recentPages.length > 0) {
    lines.push('');
    lines.push(`  ${theme.muted('Recent:')}`);

    for (const page of result.recentPages.slice(0, 8)) {
      const date = page.lastmod ? theme.warning(page.lastmod) + ' ' : '';
      const url = truncateUrl(page.url, 55);
      lines.push(`  ${date}${theme.info(url)}`);
    }

    if (result.recentPages.length > 8) {
      lines.push(`  ${theme.muted(`... +${result.recentPages.length - 8} more`)}`);
    }
  }

  if (!result.hasSitemap) {
    lines.push('');
    lines.push(`  ${theme.muted('No sitemap. Will discover by crawling.')}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Search results display
 */
export function searchResults(hits: Array<{ title: string; metadata?: { url?: string }; score?: number }>): string {
  const lines: string[] = [''];

  if (hits.length === 0) {
    lines.push(`  ${theme.muted('No results found.')}`);
    return lines.join('\n');
  }

  // Deduplicate by base title (remove page info, keep highest score)
  const seen = new Map<string, typeof hits[0]>();
  for (const hit of hits) {
    // Extract base title (remove " (page X/Y)" suffix)
    const baseTitle = hit.title.replace(/\s*\(page \d+\/\d+\)\s*$/, '');
    const existing = seen.get(baseTitle);
    if (!existing || (hit.score || 0) > (existing.score || 0)) {
      seen.set(baseTitle, { ...hit, title: baseTitle });
    }
  }
  const uniqueHits = Array.from(seen.values());

  for (let i = 0; i < uniqueHits.length; i++) {
    const hit = uniqueHits[i];
    // Normalize score: if > 1, it's probably raw similarity, cap at 99
    let scoreDisplay = '';
    if (hit.score !== undefined) {
      const normalizedScore = hit.score > 1 ? Math.min(hit.score / 2, 0.99) : hit.score;
      scoreDisplay = theme.accent(`${(normalizedScore * 100).toFixed(0)}%`) + ' ';
    }

    // Show full title (no truncation)
    lines.push(`  ${theme.muted(`${i + 1}.`)} ${scoreDisplay}${theme.white(hit.title)}`);

    if (hit.metadata?.url && !hit.metadata.url.startsWith('mv2://')) {
      lines.push(`     ${theme.muted(hit.metadata.url)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Ask result display
 */
export function askResult(answer: string, sources?: Array<{ title?: string; url?: string }>): string {
  const lines: string[] = [''];

  // Wrap answer text nicely
  const maxWidth = 75;
  const words = answer.split(' ');
  let currentLine = '  ';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine);
      currentLine = '  ' + word;
    } else {
      currentLine += (currentLine === '  ' ? '' : ' ') + word;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  lines.push('');

  if (sources && sources.length > 0) {
    // Deduplicate sources by base title (remove page info)
    const seen = new Set<string>();
    const uniqueSources = sources.filter(s => {
      // Extract base title (remove " (page X/Y)" suffix)
      let key = (s.title || s.url || '').replace(/\s*\(page \d+\/\d+\)\s*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    lines.push(`  ${theme.muted('Sources:')}`);
    for (const source of uniqueSources.slice(0, 3)) {
      // Clean up title - remove page info for cleaner display
      let display = (source.title || source.url || '').replace(/\s*\(page \d+\/\d+\)\s*$/, '');
      lines.push(`  ${theme.muted('›')} ${theme.info(display)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * List documents display
 */
export function listDocuments(items: Array<{ title?: string; url?: string; preview?: string; page?: number | string }>): string {
  const lines: string[] = [''];

  if (items.length === 0) {
    lines.push(`  ${theme.muted('No documents found.')}`);
    return lines.join('\n');
  }

  // Deduplicate by base title (remove page info)
  const seen = new Map<string, { item: typeof items[0]; pages: number }>();
  for (const item of items) {
    // Extract base title (remove " (page X/Y)" suffix)
    const baseTitle = (item.title || item.preview || '').replace(/\s*\(page \d+\/\d+\)\s*$/, '');
    const key = baseTitle || item.url || '';
    const existing = seen.get(key);
    if (existing) {
      existing.pages++;
    } else {
      seen.set(key, { item: { ...item, title: baseTitle || item.title }, pages: 1 });
    }
  }
  const uniqueItems = Array.from(seen.values());

  lines.push(`  ${theme.muted(`${uniqueItems.length} document${uniqueItems.length !== 1 ? 's' : ''}`)}`);
  lines.push('');

  for (let i = 0; i < uniqueItems.length; i++) {
    const { item, pages } = uniqueItems[i];
    const title = item.title || item.preview || 'Untitled';
    const pageInfo = pages > 1 ? theme.muted(` (${pages} pages)`) : '';

    lines.push(`  ${theme.muted(`${i + 1}.`)} ${theme.white(title)}${pageInfo}`);

    if (item.url && !item.url.startsWith('mv2://')) {
      lines.push(`     ${theme.muted(item.url)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Stats panel for detailed view
 */
export function statsPanel(stats: Record<string, string | number>): string {
  const lines: string[] = [''];

  for (const [key, value] of Object.entries(stats)) {
    const val = typeof value === 'number' ? value.toLocaleString() : value;
    lines.push(`  ${theme.muted(key)} ${theme.accent(val)}`);
  }

  return lines.join('\n');
}

/**
 * Summary table
 */
export function summaryTable(rows: Array<{ label: string; value: string | number; color?: 'success' | 'warning' | 'error' | 'info' }>): string {
  const lines: string[] = [''];

  for (const row of rows) {
    const colorFn = row.color ? theme[row.color] : theme.info;
    const value = typeof row.value === 'number' ? row.value.toLocaleString() : row.value;
    lines.push(`  ${theme.muted(row.label.padEnd(20))} ${colorFn.bold(value)}`);
  }

  return lines.join('\n');
}

// Export theme for custom usage
export { theme };
