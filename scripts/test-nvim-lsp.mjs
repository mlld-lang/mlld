#!/usr/bin/env node
/**
 * Test what the LSP sends to Neovim for a specific file
 *
 * Usage:
 *   npm run test:nvim-lsp <file.mld>
 *   npm run test:nvim-lsp <file.mld> -- --verbose
 */

import { spawn } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { resolve } from 'path';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const filePath = args.find(a => !a.startsWith('--')) || 'tmp/claude-helpers.mld';
const absolutePath = resolve(filePath.replace('~', homedir()));

console.log(`\n=== Testing Neovim LSP for: ${absolutePath} ===\n`);

// Check file exists
try {
  await stat(absolutePath);
} catch (e) {
  console.error(`File not found: ${absolutePath}`);
  process.exit(1);
}

const logFile = join(homedir(), '.local/state/nvim/lsp.log');

// Get current log size
let initialSize = 0;
try {
  const logContent = await readFile(logFile, 'utf-8');
  initialSize = logContent.split('\n').length;
} catch (e) {
  console.log('Note: LSP log file not found, will capture all output');
}

console.log('Opening file in Neovim (headless)...');

// Open in nvim headless
const nvim = spawn('nvim', [
  '--headless',
  '-c', `edit ${absolutePath}`,
  '-c', 'sleep 3',  // Wait for LSP to process
  '-c', 'quit'
], {
  stdio: 'ignore'
});

// Wait for nvim to finish
await new Promise((resolve, reject) => {
  let resolved = false;

  nvim.on('close', () => {
    if (!resolved) {
      resolved = true;
      resolve();
    }
  });

  nvim.on('error', (err) => {
    if (!resolved) {
      resolved = true;
      reject(err);
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      nvim.kill('SIGKILL'); // Force kill if still running
      resolve();
    }
  }, 10000);
});

// Wait for logs to flush
await new Promise(r => setTimeout(r, 500));

console.log('Reading LSP logs...\n');

// Read new log entries
try {
  const logContent = await readFile(logFile, 'utf-8');
  const allLines = logContent.split('\n');
  const newLines = allLines.slice(initialSize);

  if (newLines.length === 0) {
    console.log('No new LSP activity logged.');
    process.exit(0);
  }

  // Filter logs
  const filteredLines = verbose
    ? newLines
    : newLines.filter(line => {
        const lower = line.toLowerCase();
        return (
          lower.includes('token-error') ||
          lower.includes('semantic-token-error') ||
          lower.includes('unknown node type') ||
          lower.includes('error') ||
          lower.includes('[semantic]') ||
          lower.includes('attempt to perform arithmetic') ||
          lower.includes('diagnostic')
        );
      });

  if (filteredLines.length === 0) {
    console.log('✅ No errors found in LSP logs!');

    // Show semantic token activity
    const semanticLines = newLines.filter(l => l.includes('[SEMANTIC]') || l.includes('semantic'));
    if (semanticLines.length > 0) {
      console.log('\nSemantic token activity:');
      semanticLines.forEach(l => console.log('  ' + l));
    }
  } else {
    console.log(`Found ${filteredLines.length} relevant log entries:\n`);
    console.log('━'.repeat(60));

    filteredLines.forEach(line => {
      // Parse log format: [LEVEL][timestamp] source "message"
      const match = line.match(/\[(\w+)\]\[([^\]]+)\]\s+(.+)/);

      if (match) {
        const [, level, timestamp, message] = match;
        const levelColor = level === 'ERROR' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : '';
        const reset = '\x1b[0m';

        console.log(`${levelColor}[${level}]${reset} ${message}`);
      } else {
        console.log(line);
      }
    });
  }

  // Summary
  console.log('\n' + '━'.repeat(60));

  const errors = filteredLines.filter(l => l.includes('[ERROR]') || l.includes('TOKEN-ERROR'));
  const warnings = filteredLines.filter(l => l.includes('[WARN]'));
  const tokenErrors = filteredLines.filter(l => l.includes('TOKEN-ERROR'));
  const unknownNodes = filteredLines.filter(l => l.includes('Unknown node type'));

  // Count tokens generated (look for [SEMANTIC] Built N tokens)
  const tokenCountLine = newLines.find(l => l.includes('[SEMANTIC] Built') && l.includes('tokens'));
  let tokensGenerated = 0;
  if (tokenCountLine) {
    const match = tokenCountLine.match(/Built (\d+) tokens/);
    if (match) {
      tokensGenerated = parseInt(match[1]);
    }
  }

  console.log('\nSummary:');
  if (tokensGenerated > 0) {
    console.log(`  ✅ ${tokensGenerated} tokens generated`);
  } else {
    console.log(`  ❌ 0 tokens generated (LSP might have crashed)`);
  }
  if (tokenErrors.length > 0) {
    console.log(`  🔴 ${tokenErrors.length} token position errors (these tokens were rejected)`);
  }
  if (unknownNodes.length > 0) {
    console.log(`  ⚠️  ${unknownNodes.length} unknown node types (no visitors registered)`);
  }
  if (errors.length === 0 && warnings.length === 0 && tokensGenerated > 0) {
    console.log('  ✅ No errors or warnings');
  }

  process.exit(tokenErrors.length > 0 ? 1 : 0);

} catch (e) {
  console.error('Failed to read log file:', e.message);
  process.exit(1);
}
