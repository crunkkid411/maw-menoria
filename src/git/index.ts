/**
 * Git repository ingestion
 * Clone and read files from git repos
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, rmSync } from 'fs';
import { join, extname, relative } from 'path';
import { tmpdir } from 'os';
import { createLogger } from '../utils/logger.js';

const log = createLogger();

// File extensions to include
const CODE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyi',
  // Rust
  '.rs',
  // Go
  '.go',
  // Java/Kotlin
  '.java', '.kt', '.kts',
  // C/C++
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
  // C#
  '.cs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Swift
  '.swift',
  // Shell
  '.sh', '.bash', '.zsh',
  // Web
  '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  // Data/Config
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.env.example',
  // Documentation
  '.md', '.mdx', '.rst', '.txt', '.adoc',
  // SQL
  '.sql',
  // GraphQL
  '.graphql', '.gql',
  // Solidity
  '.sol',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'vendor',
  'target',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'env',
  '.tox',
  'coverage',
  '.coverage',
  '.nyc_output',
  'logs',
  'tmp',
  '.cache',
  '.parcel-cache',
  '.turbo',
]);

// Files to skip
const SKIP_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'composer.lock',
]);

// Max file size to read (500KB)
const MAX_FILE_SIZE = 500 * 1024;

export interface GitFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface GitRepoInfo {
  name: string;
  url?: string;
  localPath: string;
  isTemp: boolean;
}

/**
 * Check if a string is a git URL
 */
export function isGitUrl(input: string): boolean {
  return (
    input.startsWith('https://github.com/') ||
    input.startsWith('https://gitlab.com/') ||
    input.startsWith('https://bitbucket.org/') ||
    input.startsWith('git@github.com:') ||
    input.startsWith('git@gitlab.com:') ||
    input.endsWith('.git')
  );
}

/**
 * Check if a path is a local git repo
 */
export function isLocalGitRepo(path: string): boolean {
  try {
    return existsSync(join(path, '.git'));
  } catch {
    return false;
  }
}

/**
 * Extract repo name from URL or path
 */
function getRepoName(input: string): string {
  // GitHub URL: https://github.com/user/repo or https://github.com/user/repo.git
  const match = input.match(/\/([^/]+?)(\.git)?$/);
  if (match) return match[1];

  // Local path
  return input.split('/').pop() || 'repo';
}

/**
 * Clone a git repo to temp directory
 */
export async function cloneRepo(url: string): Promise<GitRepoInfo> {
  const repoName = getRepoName(url);
  const tempPath = join(tmpdir(), `maw-${repoName}-${Date.now()}`);

  log.info(`  Cloning ${repoName}...`);

  try {
    // Shallow clone for speed
    execSync(`git clone --depth 1 "${url}" "${tempPath}"`, {
      stdio: 'pipe',
      timeout: 60000, // 1 minute timeout
    });

    return {
      name: repoName,
      url,
      localPath: tempPath,
      isTemp: true,
    };
  } catch (error: any) {
    throw new Error(`Failed to clone ${url}: ${error.message}`);
  }
}

/**
 * Get language from file extension
 */
function getLanguage(ext: string): string {
  const langMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.sh': 'shell',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sql': 'sql',
    '.html': 'html',
    '.css': 'css',
    '.vue': 'vue',
    '.svelte': 'svelte',
  };
  return langMap[ext] || ext.slice(1) || 'text';
}

/**
 * Walk directory and collect files
 */
function* walkDir(dir: string, basePath: string = dir): Generator<GitFile> {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(basePath, fullPath);

    if (entry.isDirectory()) {
      // Skip ignored directories
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      yield* walkDir(fullPath, basePath);
    } else if (entry.isFile()) {
      // Skip ignored files
      if (SKIP_FILES.has(entry.name)) continue;

      const ext = extname(entry.name).toLowerCase();

      // Only include known extensions
      if (!CODE_EXTENSIONS.has(ext)) continue;

      // Check file size
      const stats = statSync(fullPath);
      if (stats.size > MAX_FILE_SIZE) continue;
      if (stats.size === 0) continue;

      try {
        const content = readFileSync(fullPath, 'utf-8');

        // Skip binary files (files with null bytes)
        if (content.includes('\0')) continue;

        yield {
          path: relativePath,
          content,
          language: getLanguage(ext),
          size: stats.size,
        };
      } catch {
        // Skip files that can't be read
        continue;
      }
    }
  }
}

/**
 * Read all files from a git repo
 */
export async function* readGitRepo(input: string): AsyncGenerator<GitFile> {
  let repoInfo: GitRepoInfo;

  if (isGitUrl(input)) {
    repoInfo = await cloneRepo(input);
  } else if (isLocalGitRepo(input)) {
    repoInfo = {
      name: getRepoName(input),
      localPath: input,
      isTemp: false,
    };
  } else if (existsSync(input)) {
    // Treat as local directory even if not a git repo
    repoInfo = {
      name: getRepoName(input),
      localPath: input,
      isTemp: false,
    };
  } else {
    throw new Error(`Not a valid git URL or local path: ${input}`);
  }

  try {
    let fileCount = 0;
    for (const file of walkDir(repoInfo.localPath)) {
      fileCount++;
      yield file;
    }

    log.info(`  Found ${fileCount} files`);
  } finally {
    // Clean up temp directory
    if (repoInfo.isTemp) {
      try {
        rmSync(repoInfo.localPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Get repo info without reading files
 */
export async function getRepoInfo(input: string): Promise<{ name: string; fileCount: number }> {
  let localPath: string;
  let isTemp = false;

  if (isGitUrl(input)) {
    const info = await cloneRepo(input);
    localPath = info.localPath;
    isTemp = true;
  } else {
    localPath = input;
  }

  try {
    let count = 0;
    for (const _ of walkDir(localPath)) {
      count++;
    }
    return { name: getRepoName(input), fileCount: count };
  } finally {
    if (isTemp) {
      try {
        rmSync(localPath, { recursive: true, force: true });
      } catch {}
    }
  }
}
