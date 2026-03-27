/**
 * Mnemoria Storage Layer
 * 
 * Replaces @memvid/sdk with Mnemoria for unlimited, open-source storage.
 * Maps MAW's document model to Mnemoria's entry model.
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger();

// Mnemoria stores data in a subdirectory
const MNEMORIA_DIR = 'mnemoria';

/**
 * Get the Mnemoria directory path for a given output file
 */
function getMnemoriaPath(outputPath: string): string {
  // For docs.maw, create docs.maw/mnemoria/
  return join(outputPath, MNEMORIA_DIR);
}

/**
 * Ensure Mnemoria is initialized for the output path
 */
export async function ensureMnemoria(outputPath: string): Promise<void> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    // Create the output directory first
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }
    
    // Initialize mnemoria in the output directory
    await runMnemoria(['init'], { cwd: outputPath });
    log.dim(`  Initialized Mnemoria store at ${outputPath}`);
  }
}

/**
 * Run a mnemoria command and return the output
 */
export async function runMnemoria(args: string[], options: { cwd: string }): Promise<string> {
  const isWindows = process.platform === 'win32';
  
  try {
    let stdout: string;
    if (isWindows) {
      const mnemoriaPath = 'C:\\Users\\only1\\.cargo\\bin\\mnemoria.exe';
      // Use double quotes and escape any double quotes in the args
      const cmd = args.map(a => `"${a.replace(/"/g, '`"')}"`).join(' ');
      stdout = execSync(`powershell.exe -NoProfile -Command "Set-Location -Path '${options.cwd}'; & '${mnemoriaPath}' ${cmd}"`, {
        windowsHide: true,
        encoding: 'utf8'
      });
    } else {
      stdout = execSync(`mnemoria ${args.join(' ')}`, {
        cwd: options.cwd,
        encoding: 'utf8'
      });
    }
    return stdout;
  } catch (err: any) {
    const stderr = err.stderr || err.message || '';
    throw new Error(`mnemoria failed: ${stderr || err.message}`);
  }
}

export interface MnemoriaEntry {
  id: string;
  type: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Add a document to Mnemoria
 */
export async function addDocument(
  outputPath: string,
  document: {
    title: string;
    text: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  await ensureMnemoria(outputPath);
  
  // Map MAW labels to Mnemoria types
  const typeMap: Record<string, string> = {
    'web': 'discovery',
    'code': 'feature',
    'docs': 'pattern',
    'readme': 'discovery',
  };
  
  const entryType = typeMap[document.label || 'web'] || 'discovery';
  
  // Create summary from title and first part of content
  const summary = document.title.slice(0, 200);
  
  // Add metadata as part of content
  const contentWithMetadata = document.metadata 
    ? `${document.text}\n\n---\nURL: ${document.metadata.url || 'unknown'}\nCrawled: ${document.metadata.crawledAt || 'unknown'}`
    : document.text;
  
  // Escape content for CLI
  const escapedContent = contentWithMetadata.replace(/"/g, '\\"');
  const escapedSummary = summary.replace(/"/g, '\\"');
  
  try {
    const cmdArgs = [
      'add',
      '--agent', 'maw',
      '--type', entryType,
      '--summary', escapedSummary,
      escapedContent
    ];
    const result = await runMnemoria(cmdArgs, { cwd: outputPath });
    
    // Extract ID from output like "Added entry: <uuid>"
    const match = result.match(/Added entry: ([a-f0-9-]+)/);
    return match ? match[1] : '';
  } catch (err) {
    log.warn(`  Failed to add document: ${(err as Error).message}`);
    return '';
  }
}

/**
 * Add multiple documents in batch
 */
export async function addDocuments(
  outputPath: string,
  documents: Array<{
    title: string;
    text: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<number> {
  let added = 0;
  
  for (const doc of documents) {
    const id = await addDocument(outputPath, doc);
    if (id) added++;
  }
  
  return added;
}

export interface SearchResult {
  id: string;
  summary: string;
  content: string;
  score: number;
  entryType: string;
}

/**
 * Search documents in Mnemoria
 */
export async function searchDocuments(
  outputPath: string,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    return [];
  }
  
  try {
    const result = await runMnemoria([
      'search',
      query,
      '--limit', String(limit)
    ], { cwd: outputPath });
    
    // Parse search results
    const results: SearchResult[] = [];
    const lines = result.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      // Format: 1. [discovery] (maw) Some summary (score: 0.575)
      const match = line.match(/^\d+\.\s+\[(\w+)\]\s+\((\w+)\)\s+(.+)\s+\(score:\s+([\d.]+)\)/);
      if (match) {
        results.push({
          id: '', // Search doesn't return IDs directly
          summary: match[3],
          content: '', // Need to fetch separately if needed
          score: parseFloat(match[4]),
          entryType: match[1]
        });
      }
    }
    
    return results;
  } catch (err) {
    log.warn(`  Search failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Ask a question using Mnemoria (requires external LLM)
 */
export async function askQuestion(
  outputPath: string,
  question: string,
  options: {
    model?: string;
    apiKey?: string;
  } = {}
): Promise<{ answer: string; sources: string[] }> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    throw new Error('Memory store not found');
  }
  
  // Check for Ollama first, then OpenAI
  const useOllama = !options.apiKey;
  let answer = '';
  const sources: string[] = [];
  
  if (useOllama) {
    // Use Ollama for local LLM
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || 'llama3.2',
          prompt: `You are a helpful AI assistant. Answer the user's question based on the following memory context.\n\nQuestion: ${question}\n\nUse the memory entries to provide a helpful answer.`,
          stream: false
        })
      });
      
      if (response.ok) {
        const data = await response.json() as { response: string };
        answer = data.response;
      } else {
        throw new Error(`Ollama returned ${response.status}`);
      }
    } catch (err) {
      // If Ollama not available, try semantic search fallback
      log.warn('  Ollama not available, using search fallback');
      const results = await searchDocuments(outputPath, question, 5);
      
      if (results.length === 0) {
        return { 
          answer: 'No relevant information found in the knowledge base.', 
          sources: [] 
        };
      }
      
      answer = `Based on the knowledge base, here are the relevant findings:\n\n` +
        results.map((r, i) => `${i + 1}. ${r.summary}`).join('\n\n');
      
      sources.push(...results.map(r => r.summary));
    }
  } else {
    // Use OpenAI
    // For now, fall back to search + OpenAI if available
    const results = await searchDocuments(outputPath, question, 5);
    
    if (results.length === 0) {
      return { 
        answer: 'No relevant information found in the knowledge base.', 
        sources: [] 
      };
    }
    
    // Would need to implement OpenAI call here
    // For now, use search results
    answer = `Based on the search results:\n\n` +
      results.map((r, i) => `${i + 1}. ${r.summary}`).join('\n\n');
    
    sources.push(...results.map(r => r.summary));
  }
  
  return { answer, sources };
}

/**
 * Get memory statistics
 */
export async function getStats(outputPath: string): Promise<{ entries: number; types: Record<string, number> }> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    return { entries: 0, types: {} };
  }
  
  try {
    const result = await runMnemoria(['stats'], { cwd: outputPath });
    
    // Parse stats output
    const entriesMatch = result.match(/Total entries:\s*(\d+)/);
    const entries = entriesMatch ? parseInt(entriesMatch[1]) : 0;
    
    return { entries, types: {} };
  } catch {
    return { entries: 0, types: {} };
  }
}

/**
 * List all documents (timeline)
 */
export async function listDocuments(
  outputPath: string,
  limit: number = 20
): Promise<Array<{ id: string; summary: string; type: string }>> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    return [];
  }
  
  try {
    const result = await runMnemoria([
      'timeline',
      '--limit', String(limit)
    ], { cwd: outputPath });
    
    // Parse timeline output
    const docs: Array<{ id: string; summary: string; type: string }> = [];
    const lines = result.split('\n').filter(l => l.trim() && !l.startsWith('Total'));
    
    for (const line of lines) {
      // Format: [discovery] 2024-01-01 Some summary
      const match = line.match(/^\[(\w+)\]\s+[\d-]+\s+(.+)/);
      if (match) {
        docs.push({
          id: '',
          summary: match[2].trim(),
          type: match[1]
        });
      }
    }
    
    return docs;
  } catch {
    return [];
  }
}

/**
 * Export all documents
 */
export async function exportDocuments(
  outputPath: string,
  limit: number = 10000
): Promise<Array<{ title: string; uri: string; content: string }>> {
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  if (!existsSync(mnemoriaPath)) {
    return [];
  }
  
  try {
    const result = await runMnemoria([
      'export',
      '--format', 'json',
      '--limit', String(limit)
    ], { cwd: outputPath });
    
    const data = JSON.parse(result);
    return data.map((entry: any) => ({
      title: entry.summary || 'Untitled',
      uri: entry.metadata?.url || '',
      content: entry.content || ''
    }));
  } catch {
    return [];
  }
}

/**
 * Check if output file has data
 */
export function hasData(outputPath: string): boolean {
  return existsSync(getMnemoriaPath(outputPath));
}

/**
 * Get file size (for compatibility with original API)
 */
export async function getFileSize(outputPath: string): Promise<number> {
  // Mnemoria doesn't have a single file size, so we check the directory
  const { stat } = await import('fs/promises');
  const mnemoriaPath = getMnemoriaPath(outputPath);
  
  try {
    const stats = await stat(mnemoriaPath);
    return stats.size;
  } catch {
    return 0;
  }
}
