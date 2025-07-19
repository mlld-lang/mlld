#!/usr/bin/env node
/**
 * Print a Mlld AST for a snippet
 *
 * Usage:
 *   npm run ast -- "@run [echo 'hi']"              # Parse command line args
 *   npm run ast -- file.mld                         # Auto-detect files
 *   npm run ast -- -f test.mld                      # Explicit file flag
 *   echo "@run [echo 'hi']" | npm run ast           # Parse from stdin
 *   npm run ast -- --debug "@text x = 'y'"         # Enable debug mode
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import parser from '../grammar/generated/parser/parser.js';  // Import directly from generated parser
const parse = parser.parse;

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);
let debug = false;
let filePath = null;
const snippetParts = [];

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--debug' || arg === '-d') {
    debug = true;
  } else if (arg === '-f' || arg === '--file') {
    filePath = argv[++i];
  } else {
    snippetParts.push(arg);
  }
}

// ---------- source acquisition ----------
async function readSource() {
  // If file path specified, read from file
  if (filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.readFile(filePath, 'utf8');
  }
  
  // If command line args provided
  if (snippetParts.length) {
    const possibleFile = snippetParts.join(' ');
    
    // Auto-detect: if it's a single argument that could be a file path
    if (snippetParts.length === 1 && existsSync(possibleFile)) {
      return fs.readFile(possibleFile, 'utf8');
    }
    
    // Otherwise treat as mlld snippet
    return possibleFile;
  }
  
  // Otherwise read from stdin
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ---------- main ----------
(async () => {
  try {
    if (debug) process.env.DEBUG_MLLD_GRAMMAR = '1';

    const source = (await readSource()).trimEnd();
    if (!source) {
      console.error('No Mlld source provided (arg or stdin).');
      process.exit(1);
    }

    const ast = parse(source);
    console.dir(ast, { depth: null, colors: true });
  } catch (err) {
    console.error('❌  Parse failed:', err);
    process.exitCode = 1;
  }
})();
