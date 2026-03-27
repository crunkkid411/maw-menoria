# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- Lowercase with extensions: `index.ts`, `playwright.ts`, `sitemap.ts`
- Test files: Not present in codebase (no `*.test.ts` or `*.spec.ts` found)
- Type definitions: Co-located with implementation or in `src/types/` (e.g., `src/types/cliui.d.ts`)

**Functions:**
- camelCase for all functions: `normalizeUrl()`, `createLogger()`, `extractLocale()`
- Async functions clearly marked with `async` keyword and return `Promise<T>`
- Generator functions use `function*` for async iteration: `async *crawl()`

**Classes:**
- PascalCase: `Crawler`, `Extractor`, `EngineWaterfall`, `DedupTracker`
- Private fields use `private` modifier: `private browser: Browser | null = null`

**Types and Interfaces:**
- PascalCase: `CrawlOptions`, `ExtractResult`, `EngineStats`
- Interface names often end with `Options`, `Result`, `Stats` for clarity
- Type aliases used for unions: `type EngineName = 'fetch' | 'playwright' | 'rebrowser'`

**Variables:**
- camelCase: `const startTime`, `let memoryId`
- Constants use UPPER_SNAKE_CASE: `DEFAULT_OPTIONS`, `ENGINES`, `WEB_FACTS`
- Private class fields: `private visited: Set<string> = new Set()`

## Code Style

**Formatting:**
- No explicit Prettier/ESLint config detected
- Consistent 2-space indentation throughout
- Single quotes for strings: `'playwright'`, `'fetch'`
- Semicolons used consistently
- Trailing commas in multi-line objects/arrays

**TypeScript Configuration (`tsconfig.json`):**
```json
{
  "target": "ES2022",
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "strict": true,
  "esModuleInterop": true,
  "declaration": true,
  "declarationMap": true,
  "sourceMap": true
}
```

**Linting:**
- No ESLint config detected
- Strict mode enabled in TypeScript
- Type safety enforced via `strict: true`

## Import Organization

**Order:**
1. Node.js built-in modules: `import { existsSync } from 'fs'`
2. External packages: `import PQueue from 'p-queue'`, `import chalk from 'chalk'`
3. Internal modules with relative paths: `import { Crawler } from './crawler/index.js'`

**Path Patterns:**
- All imports use `.js` extension (ESM requirement): `import { Crawler } from './crawler/index.js'`
- Barrel exports via `index.ts` files in each module directory
- Type imports use `import type`: `import type { Browser, BrowserContext } from 'playwright'`

**Path Aliases:**
- None configured - all imports use relative paths

## Error Handling

**Patterns:**
- Try-catch with typed error: `catch (error: any)`
- Error messages enhanced with context: `throw new Error(\`All engines failed for ${url}\`)`
- Graceful degradation with fallbacks:
```typescript
try {
  const article = reader.parse();
  if (article?.content) {
    // Use article
  } else {
    // Fallback
  }
} catch {
  // Fallback if Readability fails
}
```

**Global Error Handlers (CLI):**
```typescript
process.on('uncaughtException', (err) => {
  console.error(ui.errorMessage(`Unexpected error: ${err.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error(ui.errorMessage(`Unhandled error: ${message}`));
  process.exit(1);
});
```

**Timeout Wrappers:**
```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms / 1000}s`));
    }, ms);
    promise.then(resolve).catch(reject);
  });
}
```

**Error Message Enhancement:**
```typescript
if (message.includes('dimension mismatch')) {
  message = 'Vector dimension mismatch. Try: maw find <file> <query>';
} else if (message.includes('OPENAI_API_KEY')) {
  message = 'OpenAI API key required. Set OPENAI_API_KEY environment variable';
}
```

## Logging Approach

**Framework:** Custom logger using `chalk` for terminal colors

**