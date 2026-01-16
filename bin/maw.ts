#!/usr/bin/env node

/**
 * maw CLI - Feed the maw. It never forgets.
 */

import { existsSync } from 'fs';
import { Command } from 'commander';
import { maw, find, ask, list, preview, exportDocs } from '../src/index.js';
import { setLogMode } from '../src/utils/logger.js';
import * as ui from '../src/utils/ui.js';

const VERSION = '1.0.0';

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error(ui.errorMessage(`Unexpected error: ${err.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const message = reason?.message || String(reason);
  console.error(ui.errorMessage(`Unhandled error: ${message}`));
  process.exit(1);
});

/**
 * Check if .mv2 file exists and is readable
 */
function checkFileExists(file: string): void {
  if (!existsSync(file)) {
    console.error(ui.errorMessage(`File not found: ${file}`));
    process.exit(1);
  }
  if (!file.endsWith('.mv2')) {
    console.error(ui.errorMessage(`Invalid file type: ${file} (expected .mv2)`));
    process.exit(1);
  }
}

/**
 * Wrap async action with better error handling
 */
function safeAction<T extends any[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error: any) {
      // Provide helpful error messages for common issues
      let message = error.message || 'Unknown error';

      if (message.includes('dimension mismatch')) {
        message = 'Vector dimension mismatch. The file was created with a different embedding model. Try: maw find <file> <query> (uses lexical search)';
      } else if (message.includes('OPENAI_API_KEY')) {
        message = 'OpenAI API key required. Set OPENAI_API_KEY environment variable or use --api-key flag';
      } else if (message.includes('ENOENT')) {
        message = `File not found: ${message.split("'")[1] || 'unknown'}`;
      } else if (message.includes('EACCES')) {
        message = 'Permission denied. Check file permissions.';
      } else if (message.includes('ENOSPC')) {
        message = 'Disk full. Free up space and try again.';
      } else if (message.includes('fetch failed') || message.includes('ETIMEDOUT')) {
        message = 'Network error. Check your internet connection.';
      } else if (message.includes('rate limit') || message.includes('429')) {
        message = 'Rate limited. Wait a moment and try again.';
      }

      console.error(ui.errorMessage(message));
      process.exit(1);
    }
  };
}

const program = new Command();

program
  .name('maw')
  .description('Feed the maw. It never forgets.')
  .version(VERSION);

// Main command: maw <urls...> [file.mv2]
program
  .argument('[urls...]', 'URLs/repos to consume, optionally followed by target.mv2 to append')
  .option('-o, --output <file>', 'Output .mv2 file', 'maw.mv2')
  .option('-d, --depth <n>', 'Crawl depth (auto: 0 for pages, 2 for domains)')
  .option('-c, --concurrency <n>', 'Concurrent requests', '10')
  .option('-m, --max-pages <n>', 'Maximum pages to crawl (default: 150)')
  .option('-r, --rate-limit <n>', 'Requests per second', '10')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '10000')
  .option('--include <pattern>', 'URL pattern to include (regex)')
  .option('--exclude <pattern>', 'URL pattern to exclude (regex)')
  .option('--label <label>', 'Label for ingested documents', 'web')
  .option('--memory <id>', 'Cloud memory ID to bind to (from memvid.com/dashboard)')
  .option('--sitemap', 'Use sitemap.xml for discovery (default: true)')
  .option('--no-sitemap', 'Disable sitemap discovery')
  .option('--no-robots', 'Ignore robots.txt')
  .option('--browser', 'Force browser mode (for JavaScript-heavy sites)')
  .option('--stealth', 'Force stealth mode (bypasses anti-bot)')
  .option('--embed [model]', 'Enable semantic embeddings (models: bge-small, openai, nvidia)')
  .option('-q, --quiet', 'Minimal output')
  .option('-v, --verbose', 'Verbose output')
  .action(async (urls, options) => {
    if (urls.length === 0) {
      // Show banner and help
      console.log(ui.banner());
      program.help();
      return;
    }

    setLogMode(options.quiet, options.verbose);

    // Check if any argument is an .mv2 file (use as output target for appending)
    // e.g., `maw https://example.com knowledge.mv2` or `maw knowledge.mv2 https://example.com`
    const mv2Files = urls.filter((u: string) => u.endsWith('.mv2'));
    const sources = urls.filter((u: string) => !u.endsWith('.mv2'));

    // Determine output file: explicit -o flag > .mv2 in args > default
    let outputFile = options.output;
    if (mv2Files.length > 0 && options.output === 'maw.mv2') {
      // Use the .mv2 file from args if no explicit -o was given
      outputFile = mv2Files[0];
      if (mv2Files.length > 1) {
        console.error(ui.errorMessage('Only one .mv2 file can be specified as target'));
        process.exit(1);
      }
    }

    if (sources.length === 0) {
      console.error(ui.errorMessage('No URLs or sources provided'));
      process.exit(1);
    }

    // Show header - detect git repos vs URLs
    if (!options.quiet) {
      const isGit = sources.some((u: string) =>
        u.startsWith('https://github.com/') ||
        u.startsWith('https://gitlab.com/') ||
        u.includes('.git') ||
        u.startsWith('.') ||
        u.startsWith('/')
      );
      const label = isGit ? 'maw (git)' : 'maw';
      const urlDisplay = sources.length === 1 ? sources[0] : `${sources.length} sources`;
      console.log(ui.header(label, urlDisplay));

      // Show if appending to existing file
      if (existsSync(outputFile)) {
        console.log(ui.theme.info(`  → Adding to ${outputFile}\n`));
      }

      // Show embedding mode if enabled
      if (options.embed) {
        const model = typeof options.embed === 'string' ? options.embed : 'bge-small';
        console.log(ui.theme.info(`  Semantic embeddings enabled (${model})`));
        console.log(ui.theme.dim('  This improves search quality but takes longer.\n'));
      }
    }

    try {
      const result = await maw(sources, {
        output: outputFile,
        depth: options.depth ? parseInt(options.depth, 10) : undefined,  // undefined triggers auto-detect
        concurrency: parseInt(options.concurrency, 10),
        maxPages: options.maxPages ? parseInt(options.maxPages, 10) : undefined,
        rateLimit: parseInt(options.rateLimit, 10),
        timeout: parseInt(options.timeout, 10),
        includePattern: options.include ? new RegExp(options.include) : undefined,
        excludePattern: options.exclude ? new RegExp(options.exclude) : undefined,
        label: options.label,
        memoryId: options.memory,
        useSitemap: options.sitemap,
        respectRobots: options.robots,
        forceEngine: options.stealth ? 'rebrowser' : options.browser ? 'playwright' : undefined,
        enableEmbedding: !!options.embed,
        embeddingModel: typeof options.embed === 'string' ? options.embed : 'bge-small',
        quiet: options.quiet,
        verbose: options.verbose,
      });

      // Success output
      console.log(ui.successMessage(result.output, result.size, result.pages, result.duration));

      // Show dedup stats if any skipped
      const dedupStats = result.stats.dedup;
      if (dedupStats && (dedupStats.localeSkipped > 0 || dedupStats.similarSkipped > 0)) {
        console.log(ui.dedupStats(dedupStats));
      }

      // Show engine stats in verbose mode
      if (options.verbose) {
        console.log(ui.engineStats(result.stats));
      }

      // Warnings and cloud sync status
      if (result.stoppedAtLimit) {
        console.log(ui.limitWarning());
      } else if (result.memoryId) {
        console.log(ui.cloudSyncMessage(result.memoryId));
      } else if (!options.quiet) {
        console.log(ui.theme.dim('  It will never forget.'));
      }

      console.log();
    } catch (error: any) {
      console.error(ui.errorMessage(error.message));
      process.exit(1);
    }
  });

// find command: maw find <file> <query>
program
  .command('find <file> <query>')
  .description('Search in an .mv2 file')
  .option('-k, --top <n>', 'Number of results (default: 10)', '10')
  .option('--json', 'Output as JSON')
  .action(safeAction(async (file, query, options) => {
    checkFileExists(file);
    const results = await find(file, query, { k: parseInt(options.top, 10) });

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log();
    console.log(ui.searchResults(results.hits || []));
  }));

// ask command: maw ask <file> <question>
program
  .command('ask <file> <question>')
  .description('Ask a question using an .mv2 file')
  .option('--model <model>', 'LLM model to use (default: gpt-4o-mini)', 'gpt-4o-mini')
  .option('--api-key <key>', 'API key for the model')
  .option('-k, --context <n>', 'Number of context chunks to retrieve (auto: 15 for overview questions, 8 otherwise)')
  .option('--json', 'Output as JSON')
  .action(safeAction(async (file, question, options) => {
    checkFileExists(file);

    // Check for API key early
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(ui.errorMessage('OpenAI API key required. Set OPENAI_API_KEY or use --api-key'));
      process.exit(1);
    }

    const result = await ask(file, question, {
      model: options.model,
      apiKey,
      k: options.context ? parseInt(options.context, 10) : undefined,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(ui.askResult(result.answer, result.sources));
  }));

// list command: maw list <file>
program
  .command('list <file>')
  .description('List documents in an .mv2 file')
  .option('-l, --limit <n>', 'Number of documents to show (default: 20)', '20')
  .option('--json', 'Output as JSON')
  .action(safeAction(async (file, options) => {
    checkFileExists(file);
    const results = await list(file, { limit: parseInt(options.limit, 10) });

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    const items = results.hits || results.frames || results;
    if (Array.isArray(items) && items.length > 0) {
      console.log(ui.listDocuments(items.map((item: any) => ({
        title: item.title || item.preview?.slice(0, 60) || `Frame ${item.frame_id}`,
        url: item.metadata?.url || item.uri,
        preview: item.preview,
      }))));
    } else {
      console.log(`\n  ${ui.theme.muted('No documents found.')}\n`);
    }
  }));

// preview command: maw preview <url> (or np)
program
  .command('preview <url>')
  .alias('np')
  .description('Preview available pages on a site (sitemap discovery)')
  .option('-l, --limit <n>', 'Number of pages to show', '20')
  .option('--json', 'Output as JSON')
  .action(safeAction(async (url, options) => {
    // Basic URL validation
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      console.error(ui.errorMessage(`Invalid URL: ${url}`));
      process.exit(1);
    }

    const result = await preview(url, { limit: parseInt(options.limit, 10) });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(ui.previewResults(result));
  }));

// export command: maw export <file>
program
  .command('export <file>')
  .description('Export .mv2 file to other formats')
  .option('-f, --format <format>', 'Output format: json, markdown, csv', 'json')
  .option('--out <file>', 'Output file (default: stdout)')
  .action(safeAction(async (file, options) => {
    checkFileExists(file);

    // Get full content for all documents
    const docs = await exportDocs(file, { limit: 10000 });

    let output: string;

    switch (options.format) {
      case 'markdown':
        output = docs.map((doc) => {
          return `# ${doc.title}\n\n${doc.content}\n\n---\n`;
        }).join('\n');
        break;

      case 'csv':
        const headers = ['title', 'uri'];
        const rows = docs.map((doc) => {
          return [
            `"${(doc.title || '').replace(/"/g, '""')}"`,
            `"${(doc.uri || '').replace(/"/g, '""')}"`,
          ].join(',');
        });
        output = [headers.join(','), ...rows].join('\n');
        break;

      default:
        output = JSON.stringify(docs, null, 2);
    }

    if (options.out) {
      const { writeFileSync } = await import('fs');
      writeFileSync(options.out, output);
      console.log(ui.theme.success(`\n  Exported ${docs.length} documents to ${options.out}\n`));
    } else {
      console.log(output);
    }
  }));

program.parse();
