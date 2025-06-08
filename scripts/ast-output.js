#!/usr/bin/env node
/**
 * Print a Mlld AST for a snippet, builds grammar first via `npm run ast`
 *
 *   npm run ast -- "@run [echo 'hi']"
 *   echo "@run [echo 'hi']" | npm run ast -- --debug
 */

import fs from 'node:fs/promises';
import parser from '../grammar/generated/parser/parser.js';  // Import directly from generated parser
const parse = parser.parse;

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);
let debug = false;
const snippetParts = [];

for (const arg of argv) {
  if (arg === '--debug' || arg === '-d') {
    debug = true;
  } else {
    snippetParts.push(arg);
  }
}

// ---------- source acquisition ----------
async function readSource() {
  if (snippetParts.length) return snippetParts.join(' ');
  return fs.readFile(0, 'utf8');           // read from stdin
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
