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

// ---------- shell escaping detection ----------
function detectShellEscapingIssues(source, error) {
  // Check for common shell-problematic characters
  const problematicChars = ['!', '[', ']', '{', '}', '(', ')', '|', '&', ';', '<', '>', '`', '$', '"', "'", '\n', '\r'];
  const hasProblematicChars = problematicChars.some(char => source.includes(char));
  
  // Check if error is about unclosed brackets/arrays/objects or syntax errors that might be shell-related
  const unclosedPatterns = [
    'Unclosed array',
    'Unclosed object',
    'Expected \']\'',
    'Expected \'}\'',
    'Read-only file system',
    '/show:',
    '/var:',
    '/exe:',
    'command not found',
    'Missing content in /show directive',
    'Expected end of input',
    'Expected "=>"',
    'but "!" found',
    'syntax error near unexpected token',
    'Missing value in /var directive',
    'No such file or directory'
  ];
  
  const isLikelyShellIssue = unclosedPatterns.some(pattern => 
    error.message?.includes(pattern) || error.toString().includes(pattern)
  );
  
  // Also check for specific negation operator issues
  if (source.includes('!') && (error.message?.includes('but "!" found') || error.message?.includes('Expected'))) {
    return true;
  }
  
  // Check for backtick command substitution issues
  if (source.includes('`') && (error.message?.includes('command not found') || error.message?.includes('No such file') || error.message?.includes('Missing value'))) {
    return true;
  }
  
  // Check for shell syntax errors from parentheses
  if (source.includes('(') && error.toString().includes('syntax error near unexpected token')) {
    return true;
  }
  
  return hasProblematicChars && isLikelyShellIssue;
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
    // Check if this might be a shell escaping issue
    if (snippetParts.length > 0 && detectShellEscapingIssues(snippetParts.join(' '), err)) {
      console.error('❌  Parse failed: Likely shell escaping issue detected.\n');
      console.error('The command line may have trouble with special characters like brackets, quotes, or newlines.');
      console.error('\nTry one of these alternatives:');
      console.error('1. Write your mlld code to a file and pass the filename:');
      console.error('   echo \'your mlld code\' > temp.mld && npm run ast -- temp.mld\n');
      console.error('2. Use stdin instead:');
      console.error('   echo \'your mlld code\' | npm run ast\n');
      console.error('3. For multi-line code, use a heredoc:');
      console.error('   npm run ast << \'EOF\'');
      console.error('   your mlld code here');
      console.error('   EOF\n');
      console.error('Original error:', err.message);
    } else {
      console.error('❌  Parse failed:', err);
    }
    process.exitCode = 1;
  }
})();
