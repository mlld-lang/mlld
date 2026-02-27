#!/usr/bin/env node
/**
 * Capture expected output for documentation test blocks.
 *
 * Usage:
 *   npm run doc:expect -- quickstart/a1b2c3d4    # capture one block
 *   npm run doc:expect -- quickstart              # capture all blocks in a doc
 *   npm run doc:expect -- atoms/directives/exe    # capture all blocks in an atom
 *   npm run doc:expect -- --all                   # capture all doc blocks
 *   npm run doc:expect -- --orphans               # show orphaned expectations
 *   npm run doc:expect -- --dry-run <pattern>     # show output without writing
 *   npm run doc:expect -- --status                # show which blocks have/lack expectations
 *   npm run doc:expect -- --status quickstart     # status for one doc
 *
 * Options:
 *   --yes           Auto-accept all outputs (no confirmation)
 *   --dry-run       Show output without writing expected.md
 *   --orphans       List orphaned hash dirs with stale expectations
 *   --status        Show coverage: which blocks have expected.md and which don't
 *   --all           Process all doc test blocks
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(PROJECT_ROOT, 'tests', 'cases', 'docs');

/**
 * Dynamically import processMlld from the SDK (requires build)
 */
async function loadInterpreter() {
  try {
    const mod = await import('../dist/index.mjs');
    return mod.processMlld;
  } catch (error) {
    console.error('❌ Could not load processMlld. Run `npm run build` first.');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

/**
 * Ask user for confirmation
 */
async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Find doc test directories matching a pattern
 */
async function findTestDirs(pattern) {
  const results = [];

  if (pattern === '--all') {
    return await findAllTestDirs(CASES_DIR);
  }

  // Pattern can be: "quickstart/a1b2c3d4" (specific) or "quickstart" (all in doc)
  const parts = pattern.split('/');
  const targetDir = path.join(CASES_DIR, ...parts);

  try {
    const stat = await fs.stat(targetDir);
    if (stat.isDirectory()) {
      // Check if this is a hash dir (has example.mld/md)
      const files = await fs.readdir(targetDir);
      const hasExample = files.some(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));

      if (hasExample) {
        results.push(targetDir);
      } else {
        // It's a doc dir — find all hash dirs inside it
        return await findAllTestDirs(targetDir);
      }
    }
  } catch {
    console.error(`❌ Not found: ${targetDir}`);
    console.error(`   Try: npm run doc:expect -- --all`);
    process.exit(1);
  }

  return results;
}

/**
 * Recursively find all test directories (dirs with example.mld/md files)
 */
async function findAllTestDirs(baseDir) {
  const results = [];
  const entries = await fs.readdir(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(baseDir, entry.name);
    const files = await fs.readdir(dirPath);
    const hasExample = files.some(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));

    if (hasExample) {
      results.push(dirPath);
    } else {
      results.push(...await findAllTestDirs(dirPath));
    }
  }

  return results;
}

/**
 * Find orphaned hash dirs (have expected.md but no example file)
 */
async function findOrphans(baseDir) {
  const orphans = [];
  const entries = await fs.readdir(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(baseDir, entry.name);

    if (/^[0-9a-f]{8}$/.test(entry.name)) {
      // Hash dir — check for orphan
      const files = await fs.readdir(dirPath);
      const hasExample = files.some(f => f.startsWith('example'));
      const hasExpected = files.includes('expected.md');

      if (!hasExample && hasExpected) {
        let description = null;
        try {
          description = (await fs.readFile(path.join(dirPath, '.description'), 'utf-8')).trim();
        } catch { /* no description */ }
        orphans.push({
          path: path.relative(CASES_DIR, dirPath),
          hash: entry.name,
          description
        });
      }
    } else {
      // Recurse into doc name dirs
      orphans.push(...await findOrphans(dirPath));
    }
  }

  return orphans;
}

/**
 * Execute a doc test block and return its output
 */
async function executeBlock(dirPath, interpret) {
  const files = await fs.readdir(dirPath);

  // Check for skip files
  const skipFiles = files.filter(f => f === 'skip.md' || (f.startsWith('skip-') && f.endsWith('.md')));
  const nonLiveSkips = skipFiles.filter(f => f !== 'skip-live.md');
  if (nonLiveSkips.length > 0) {
    return { skipped: true, reason: nonLiveSkips[0] };
  }

  const exampleFile = files.find(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));
  if (!exampleFile) {
    return { error: 'No example file found' };
  }

  const input = await fs.readFile(path.join(dirPath, exampleFile), 'utf-8');
  const mode = exampleFile.endsWith('.mld') ? 'strict' : 'markdown';

  try {
    const output = await interpret(input, {
      format: 'markdown',
      mode,
      useMarkdownFormatter: false,
    });

    return { output: typeof output === 'string' ? output : '' };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Show status of all doc test blocks: which have expected.md and which don't.
 */
async function showStatus(filterPattern) {
  const baseDir = filterPattern
    ? path.join(CASES_DIR, ...filterPattern.split('/'))
    : CASES_DIR;

  let testDirs;
  try {
    testDirs = await findAllTestDirs(baseDir);
  } catch {
    console.error(`❌ Not found: ${baseDir}`);
    process.exit(1);
  }

  let withExpected = 0;
  let withoutExpected = 0;
  let skipped = 0;
  let currentDoc = '';

  for (const dirPath of testDirs.sort()) {
    const relPath = path.relative(CASES_DIR, dirPath);
    const files = await fs.readdir(dirPath);
    const hasExpected = files.includes('expected.md');
    const hasSkip = files.some(f => f === 'skip.md' || (f.startsWith('skip-') && f.endsWith('.md') && f !== 'skip-live.md'));

    // Group by doc name
    const docName = relPath.split('/').slice(0, -1).join('/');
    if (docName !== currentDoc) {
      if (currentDoc) console.log('');
      console.log(`  ${docName}/`);
      currentDoc = docName;
    }

    const hash = path.basename(relPath);
    let description = '';
    try {
      description = (await fs.readFile(path.join(dirPath, '.description'), 'utf-8')).trim();
      // Extract just the heading part after the colon
      const match = description.match(/:\s*(.+?)(?:\s*\((?:strict|markdown) mode\))?$/);
      if (match) description = match[1];
    } catch { /* ignore */ }

    const label = description ? `${hash} ${description}` : hash;

    if (hasSkip) {
      console.log(`    ⏭ ${label}`);
      skipped++;
    } else if (hasExpected) {
      console.log(`    ✓ ${label}`);
      withExpected++;
    } else {
      console.log(`    ○ ${label}`);
      withoutExpected++;
    }
  }

  const total = withExpected + withoutExpected + skipped;
  console.log(`\n  ${withExpected}/${total} have expectations, ${withoutExpected} without, ${skipped} skipped`);
}

async function main() {
  const args = process.argv.slice(2);
  const autoYes = args.includes('--yes');
  const dryRun = args.includes('--dry-run');
  const showOrphans = args.includes('--orphans');
  const showStatusFlag = args.includes('--status');

  // Filter out flags
  const patterns = args.filter(a => !a.startsWith('--'));

  if (showStatusFlag) {
    await showStatus(patterns[0] || null);
    return;
  }

  if (showOrphans) {
    const orphans = await findOrphans(CASES_DIR);
    if (orphans.length === 0) {
      console.log('No orphaned expectations found.');
    } else {
      console.log(`Found ${orphans.length} orphan(s):\n`);
      for (const orphan of orphans) {
        console.log(`  ${orphan.path}/`);
        if (orphan.description) {
          console.log(`    Was: ${orphan.description}`);
        }
        console.log(`    Has: expected.md (stale)`);
        console.log('');
      }
    }
    return;
  }

  if (patterns.length === 0 && !args.includes('--all')) {
    console.log('Usage: npm run doc:expect -- <pattern> [--yes] [--dry-run]');
    console.log('       npm run doc:expect -- --all [--yes] [--dry-run]');
    console.log('       npm run doc:expect -- --status [doc-name]');
    console.log('       npm run doc:expect -- --orphans');
    console.log('');
    console.log('Examples:');
    console.log('  npm run doc:expect -- quickstart/a1b2c3d4  # capture one block');
    console.log('  npm run doc:expect -- quickstart            # capture all in a doc');
    console.log('  npm run doc:expect -- --all --dry-run       # preview all outputs');
    console.log('  npm run doc:expect -- --status              # see coverage');
    console.log('  npm run doc:expect -- --status quickstart   # see coverage for one doc');
    process.exit(0);
  }

  const pattern = patterns[0] || '--all';
  const testDirs = await findTestDirs(pattern);

  if (testDirs.length === 0) {
    console.log('No matching doc test directories found.');
    process.exit(1);
  }

  console.log(`Found ${testDirs.length} doc test block(s) to process.\n`);

  const interpret = await loadInterpreter();
  let captured = 0;
  let skipped = 0;
  let errored = 0;

  for (const dirPath of testDirs) {
    const relPath = path.relative(CASES_DIR, dirPath);
    const files = await fs.readdir(dirPath);
    const hasExpected = files.includes('expected.md');

    // Read description for context
    let description = '';
    try {
      description = (await fs.readFile(path.join(dirPath, '.description'), 'utf-8')).trim();
    } catch { /* ignore */ }

    // Skip if already has expected.md (unless --all explicitly used)
    if (hasExpected && pattern !== '--all') {
      console.log(`  ⏭  ${relPath} (already has expected.md)`);
      skipped++;
      continue;
    }

    const result = await executeBlock(dirPath, interpret);

    if (result.skipped) {
      console.log(`  ⏭  ${relPath} (${result.reason})`);
      skipped++;
      continue;
    }

    if (result.error) {
      console.log(`  ✗  ${relPath}: ${result.error}`);
      errored++;
      continue;
    }

    const output = result.output.trim();
    if (!output) {
      console.log(`  ○  ${relPath} (empty output — skipping)`);
      skipped++;
      continue;
    }

    console.log(`  ✓  ${relPath}`);
    if (description) {
      console.log(`     ${description}`);
    }
    console.log(`     Output (${output.split('\n').length} lines):`);
    // Show first few lines
    const lines = output.split('\n');
    const preview = lines.slice(0, 5);
    for (const line of preview) {
      console.log(`     │ ${line}`);
    }
    if (lines.length > 5) {
      console.log(`     │ ... (${lines.length - 5} more lines)`);
    }

    if (dryRun) {
      console.log('     (dry run — not writing)');
      captured++;
      continue;
    }

    let shouldWrite = autoYes;
    if (!shouldWrite) {
      shouldWrite = await confirm(`     Write expected.md? [y/N] `);
    }

    if (shouldWrite) {
      await fs.writeFile(path.join(dirPath, 'expected.md'), output + '\n');
      console.log('     ✓ Written');
      captured++;
    } else {
      console.log('     ⏭ Skipped');
      skipped++;
    }
    console.log('');
  }

  console.log(`\nDone: ${captured} captured, ${skipped} skipped, ${errored} errored`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
