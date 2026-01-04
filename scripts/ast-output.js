#!/usr/bin/env node
/**
 * Print a Mlld AST for a snippet
 *
 * Usage:
 *   npm run ast -- "var @x = 1"                     # Parse in strict mode (default)
 *   npm run ast -- --markdown "/var @x = 1"         # Parse in markdown mode
 *   npm run ast -- file.mld                         # Auto-detect mode from extension
 *   npm run ast -- -f test.mld                      # Explicit file flag
 *   echo "var @x = 1" | npm run ast                 # Parse from stdin (strict mode)
 *   npm run ast -- --debug "var @x = 1"             # Enable debug mode
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import parser from '../grammar/generated/parser/parser.js';
const parse = parser.parse;

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);
let debug = false;
let filePath = null;
let markdownMode = false;
const snippetParts = [];

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--debug' || arg === '-d') {
    debug = true;
  } else if (arg === '-f' || arg === '--file') {
    filePath = argv[++i];
  } else if (arg === '--markdown' || arg === '-m') {
    markdownMode = true;
  } else {
    snippetParts.push(arg);
  }
}

/**
 * Determine parse options from file path
 * .mld.md -> markdown mode
 * .mld -> strict mode
 * .att -> at-template (TemplateBodyAtt start rule)
 * .mtt -> mustache-template (TemplateBodyMtt start rule)
 */
function getParseOptionsFromPath(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.att')) {
    return { mode: 'strict', startRule: 'TemplateBodyAtt' };
  }
  if (lowerPath.endsWith('.mtt')) {
    return { mode: 'strict', startRule: 'TemplateBodyMtt' };
  }
  if (lowerPath.endsWith('.mld.md')) {
    return { mode: 'markdown', startRule: 'Start' };
  }
  if (lowerPath.endsWith('.mld')) {
    return { mode: 'strict', startRule: 'Start' };
  }
  return { mode: 'strict', startRule: 'Start' }; // default
}

// Legacy function for compatibility
function getModeFromPath(path) {
  return getParseOptionsFromPath(path).mode;
}

// ---------- source acquisition ----------
// Returns { source, detectedFile } where detectedFile is the path if reading from file
async function readSource() {
  // If file path specified, read from file
  if (filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return { source: await fs.readFile(filePath, 'utf8'), detectedFile: filePath };
  }

  // If command line args provided
  if (snippetParts.length) {
    const possibleFile = snippetParts.join(' ');

    // Auto-detect: if it's a single argument that could be a file path
    if (snippetParts.length === 1 && existsSync(possibleFile)) {
      return { source: await fs.readFile(possibleFile, 'utf8'), detectedFile: possibleFile };
    }

    // Otherwise treat as mlld snippet
    return { source: possibleFile, detectedFile: null };
  }

  // Otherwise read from stdin
  const source = await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
  return { source, detectedFile: null };
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

    const { source: rawSource, detectedFile } = await readSource();
    const source = rawSource.trimEnd();
    if (!source) {
      console.error('No Mlld source provided (arg or stdin).');
      process.exit(1);
    }

    // Determine parse options: CLI flag > file extension > default (strict)
    let parseOptions = { mode: 'strict', startRule: 'Start' };
    if (markdownMode) {
      parseOptions.mode = 'markdown';
    } else if (detectedFile) {
      parseOptions = getParseOptionsFromPath(detectedFile);
    }

    const ast = parse(source, parseOptions);
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
