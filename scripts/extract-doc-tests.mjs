#!/usr/bin/env node
/**
 * Extract mlld code blocks from documentation and create test cases
 * This runs as part of the build:fixtures process to ensure docs are always tested
 *
 * Uses content-addressed directories: each code block's directory name is a
 * truncated SHA-256 hash of its content. This means:
 * - Directories are stable when blocks are reordered in docs
 * - expected.md files survive reordering (tied to content, not position)
 * - Content changes are detected as orphaned dirs with stale expectations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Known mlld directive keywords (both with and without / prefix)
 */
const DIRECTIVE_KEYWORDS = [
  'var', 'show', 'exe', 'run', 'for', 'when', 'import', 'export',
  'output', 'append', 'log', 'stream', 'data', 'load', 'while', 'skip'
];

/** Files preserved during clean (not regenerated from docs) */
const PRESERVED_FILES = new Set([
  'expected.md', 'error.md', 'warning.md'
]);

/** Check if a filename should be preserved during clean */
function isPreservedFile(name) {
  return PRESERVED_FILES.has(name) || name.startsWith('skip');
}

/**
 * Compute content hash for a code block (8 hex chars = 32 bits)
 */
function contentHash(code) {
  return createHash('sha256').update(code).digest('hex').slice(0, 8);
}

/**
 * Check if a line looks like an mlld directive (strict or markdown mode)
 */
function looksLikeDirective(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('>>') || trimmed.startsWith('#')) {
    return false; // Comment or empty
  }

  // Check for /directive (markdown mode)
  if (trimmed.startsWith('/')) {
    const afterSlash = trimmed.slice(1).split(/\s/)[0];
    return DIRECTIVE_KEYWORDS.includes(afterSlash);
  }

  // Check for bare directive (strict mode)
  const firstWord = trimmed.split(/\s/)[0];
  return DIRECTIVE_KEYWORDS.includes(firstWord);
}

/**
 * Extract mlld code blocks from a markdown file
 * Supports both ```mlld (strict mode) and ```mlld:md (markdown mode)
 */
function extractMlldCodeBlocks(content, filePath) {
  const blocks = [];
  const lines = content.split('\n');

  let inCodeBlock = false;
  let currentBlock = [];
  let blockStartLine = 0;
  let blockLanguage = '';
  let blockMode = 'strict'; // 'strict' or 'markdown'
  let lastHeading = '';
  let blockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track headings for context
    if (line.match(/^#+\s+/)) {
      lastHeading = line.replace(/^#+\s+/, '').trim();
    }

    // Check for code block start
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Starting a code block
        const lang = line.slice(3).trim().toLowerCase();

        // Support ```mlld (strict) and ```mlld:md (markdown)
        if (lang === 'mlld' || lang === 'mlld:md') {
          inCodeBlock = true;
          blockLanguage = 'mlld';
          blockMode = lang === 'mlld:md' ? 'markdown' : 'strict';
          currentBlock = [];
          blockStartLine = i + 1;
          blockIndex++;
        }
      } else if (inCodeBlock && blockLanguage === 'mlld') {
        // Ending an mlld code block
        inCodeBlock = false;

        const code = currentBlock.join('\n');

        // Check if block contains actual directives
        const hasDirective = code.split('\n').some(l => looksLikeDirective(l));

        if (code.trim() && hasDirective) {
          blocks.push({
            code,
            line: blockStartLine,
            description: lastHeading || `Block ${blockIndex}`,
            index: blockIndex,
            mode: blockMode,
            hash: contentHash(code)
          });
        }

        currentBlock = [];
        blockLanguage = '';
        blockMode = 'strict';
      }
    } else if (inCodeBlock && blockLanguage === 'mlld') {
      currentBlock.push(line);
    }
  }

  // Warn if unclosed code block
  if (inCodeBlock) {
    console.warn(`  ⚠️  Unclosed mlld code block in ${filePath} at line ${blockStartLine}`);
  }

  return blocks;
}

/**
 * Clean directory: remove regenerated files, preserve expected.md etc.
 * Returns a map of hash dirs that have preserved files (for orphan detection).
 */
async function cleanDirectory(dir) {
  const preservedDirs = new Map(); // hash → { files: string[], description: string|null }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Check if this is a hash dir (8 hex chars) or a doc-name dir
        if (/^[0-9a-f]{8}$/.test(entry.name)) {
          // Hash dir — clean regenerated files, track preserved files
          const subEntries = await fs.readdir(fullPath);
          const preserved = [];
          let description = null;

          for (const subFile of subEntries) {
            const subPath = path.join(fullPath, subFile);
            if (isPreservedFile(subFile)) {
              preserved.push(subFile);
            } else if (subFile === '.description') {
              // Read description for orphan reporting; keep the file
              // (it will be overwritten on active dirs, and is useful on orphans)
              try {
                description = (await fs.readFile(subPath, 'utf-8')).trim();
              } catch { /* ignore */ }
            } else if (subFile === 'example.md' || subFile === 'example.mld') {
              await fs.unlink(subPath);
            }
          }

          if (preserved.length > 0) {
            preservedDirs.set(entry.name, { files: preserved, description });
          }
        } else {
          // Doc-name dir (e.g., "quickstart", "atoms") — recurse
          const subPreserved = await cleanDirectory(fullPath);
          // Prefix keys with the dir name for full path context
          for (const [hash, info] of subPreserved) {
            preservedDirs.set(`${entry.name}/${hash}`, info);
          }
        }
      } else if (entry.isFile()) {
        // Remove legacy numbered-dir files at this level if any
        if (entry.name === 'example.md' || entry.name === 'example.mld' || entry.name === '.description') {
          await fs.unlink(fullPath);
        }
      }
    }

    // Also clean up legacy numbered directories (01/, 02/, etc.)
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d{2}$/.test(entry.name)) {
        const legacyDir = path.join(dir, entry.name);
        const legacyEntries = await fs.readdir(legacyDir);
        // Only remove if it has no preserved files
        const hasPreserved = legacyEntries.some(f => isPreservedFile(f));
        if (!hasPreserved) {
          await fs.rm(legacyDir, { recursive: true });
        } else {
          console.log(`  ⚠️  Legacy numbered dir ${path.relative(dir, legacyDir)} has preserved files — skipping removal`);
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist yet, that's fine
  }

  return preservedDirs;
}

/**
 * Process a documentation file and create test cases
 * Returns { fileName, count, hashes } where hashes is the set of content hashes created
 */
async function processDocFile(docPath, outputDir) {
  const content = await fs.readFile(docPath, 'utf-8');
  const fileName = path.basename(docPath, '.md');

  const blocks = extractMlldCodeBlocks(content, docPath);

  if (blocks.length === 0) {
    return { fileName, count: 0, hashes: new Set() };
  }

  // Create directory for this doc's tests
  const docTestDir = path.join(outputDir, fileName);
  await fs.mkdir(docTestDir, { recursive: true });

  const hashes = new Set();

  // Create a test case for each code block
  for (const block of blocks) {
    // Use content hash as directory name
    const blockDir = path.join(docTestDir, block.hash);
    await fs.mkdir(blockDir, { recursive: true });
    hashes.add(block.hash);

    // Write the example file with appropriate extension based on mode
    // strict mode → .mld, markdown mode → .md
    const exampleExt = block.mode === 'markdown' ? '.md' : '.mld';
    const examplePath = path.join(blockDir, `example${exampleExt}`);
    await fs.writeFile(examplePath, block.code);

    // Write a description file for context
    const descPath = path.join(blockDir, '.description');
    const description = `From ${fileName}.md line ${block.line}: ${block.description} (${block.mode} mode)`;
    await fs.writeFile(descPath, description);
  }

  return { fileName, count: blocks.length, hashes };
}

/**
 * Detect orphaned hash dirs that have expected.md but no longer match any current block.
 * Uses the preservedDirs map (captured during clean before descriptions were deleted)
 * and fuzzy matching to suggest which new hash dir the expectation should migrate to.
 *
 * @param outputDir - The docs test output directory
 * @param allHashesByDoc - Map of docName → Set of current content hashes
 * @param preservedDirs - Map from cleanDirectory: "docname/hash" → { files, description }
 */
async function detectOrphans(outputDir, allHashesByDoc, preservedDirs) {
  const orphans = [];

  // Walk preservedDirs to find hashes that are no longer in any current doc
  for (const [dirKey, info] of preservedDirs) {
    // dirKey format: "quickstart/a1b2c3d4" or "atoms/directives/exe/a1b2c3d4"
    // We need to split into docName and hash
    const lastSlash = dirKey.lastIndexOf('/');
    if (lastSlash === -1) continue;
    const docName = dirKey.slice(0, lastSlash);
    const hash = dirKey.slice(lastSlash + 1);

    // Check if this hash is still active
    const currentHashes = allHashesByDoc.get(docName);
    if (currentHashes && currentHashes.has(hash)) continue; // Still active

    orphans.push({ docName, hash, files: info.files, description: info.description });
  }

  // Also scan for orphaned dirs not captured during clean (edge case: dir was empty during clean
  // but got expected.md added manually between cleans)
  for (const [docName, currentHashes] of allHashesByDoc) {
    const docDir = path.join(outputDir, docName);
    let entries;
    try {
      entries = await fs.readdir(docDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[0-9a-f]{8}$/.test(entry.name)) continue;

      const hash = entry.name;
      if (currentHashes.has(hash)) continue;
      if (orphans.some(o => o.docName === docName && o.hash === hash)) continue; // Already found

      const dirPath = path.join(docDir, hash);
      const files = await fs.readdir(dirPath);
      const preserved = files.filter(f => isPreservedFile(f));

      if (preserved.length > 0) {
        orphans.push({ docName, hash, files: preserved, description: null });
      } else {
        // Empty orphan — remove it
        await fs.rm(dirPath, { recursive: true });
      }
    }
  }

  if (orphans.length > 0) {
    console.log(`\n⚠️  Found ${orphans.length} orphaned doc test(s) with stale expectations:`);

    for (const orphan of orphans) {
      const preserved = orphan.files.join(', ');
      console.log(`  • ${orphan.docName}/${orphan.hash} (has ${preserved})`);
      if (orphan.description) {
        console.log(`    Was: ${orphan.description}`);
      }

      // Try fuzzy match: find the new hash dir whose description is most similar
      const currentHashes = allHashesByDoc.get(orphan.docName);
      if (currentHashes && orphan.description) {
        const bestMatch = await findClosestMatch(
          path.join(outputDir, orphan.docName),
          currentHashes,
          orphan.description
        );
        if (bestMatch) {
          console.log(`    Likely moved to: ${orphan.docName}/${bestMatch.hash}`);
          console.log(`    Now: ${bestMatch.description}`);
          console.log(`    Run: npm run doc:expect -- ${orphan.docName}/${bestMatch.hash}`);
        }
      }
    }
  }

  return orphans;
}

/**
 * Find the current hash dir whose .description is most similar to the orphan's description.
 * Uses simple word-overlap scoring (Jaccard similarity on words).
 */
async function findClosestMatch(docDir, currentHashes, orphanDescription) {
  const orphanWords = new Set(orphanDescription.toLowerCase().split(/\s+/));
  let bestScore = 0;
  let bestMatch = null;

  for (const hash of currentHashes) {
    const descPath = path.join(docDir, hash, '.description');
    let desc;
    try {
      desc = (await fs.readFile(descPath, 'utf-8')).trim();
    } catch {
      continue;
    }

    const descWords = new Set(desc.toLowerCase().split(/\s+/));
    const intersection = [...orphanWords].filter(w => descWords.has(w));
    const union = new Set([...orphanWords, ...descWords]);
    const score = intersection.length / union.size;

    if (score > bestScore && score > 0.3) { // Minimum 30% word overlap
      bestScore = score;
      bestMatch = { hash, description: desc, score };
    }
  }

  return bestMatch;
}

/**
 * Recursively collect all .md files from a directory
 */
async function collectMdFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract documentation tests
 */
export async function extractDocumentationTests() {
  const USER_DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'user');
  const ATOMS_DIR = path.join(PROJECT_ROOT, 'docs', 'src', 'atoms');
  const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests', 'cases', 'docs');

  console.log('📖 Extracting documentation code blocks...');

  // Clean existing doc tests (but preserve expected.md files)
  // preservedDirs captures descriptions before they're deleted, for orphan detection later
  const preservedDirs = await cleanDirectory(OUTPUT_DIR);

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Track all hashes per doc for orphan detection
  // Key format: "docname" for user docs, "atoms/category/atomname" for atoms
  const allHashesByDoc = new Map();

  let totalBlocks = 0;
  const results = [];

  // Process user docs (flat directory)
  const docFiles = await fs.readdir(USER_DOCS_DIR);
  const mdFiles = docFiles.filter(f => f.endsWith('.md') && !f.includes('-review'));

  for (const file of mdFiles) {
    const filePath = path.join(USER_DOCS_DIR, file);
    const result = await processDocFile(filePath, OUTPUT_DIR);
    totalBlocks += result.count;
    results.push(result);
    if (result.hashes.size > 0) {
      allHashesByDoc.set(result.fileName, result.hashes);
    }
  }

  console.log(`  ✓ Extracted ${totalBlocks} mlld blocks from ${mdFiles.length} user docs`);
  for (const result of results) {
    if (result.count > 0) {
      console.log(`    • ${result.fileName}: ${result.count} blocks`);
    }
  }

  // Process atoms (nested category/atom.md structure)
  const atomsOutputDir = path.join(OUTPUT_DIR, 'atoms');
  await fs.mkdir(atomsOutputDir, { recursive: true });

  const atomFiles = await collectMdFiles(ATOMS_DIR);
  let atomBlocks = 0;
  const atomResults = [];

  for (const atomPath of atomFiles) {
    const relPath = path.relative(ATOMS_DIR, atomPath);
    const category = path.dirname(relPath);
    const atomName = path.basename(relPath, '.md');
    const atomOutputDir = path.join(atomsOutputDir, category);
    await fs.mkdir(atomOutputDir, { recursive: true });
    const result = await processDocFile(atomPath, atomOutputDir);
    atomBlocks += result.count;
    atomResults.push({ ...result, category });
    if (result.hashes.size > 0) {
      allHashesByDoc.set(`atoms/${category}/${result.fileName}`, result.hashes);
    }
  }

  totalBlocks += atomBlocks;

  console.log(`  ✓ Extracted ${atomBlocks} mlld blocks from ${atomFiles.length} atoms`);
  for (const result of atomResults) {
    if (result.count > 0) {
      console.log(`    • atoms/${result.category}/${result.fileName}: ${result.count} blocks`);
    }
  }

  // Detect orphaned expectations
  await detectOrphans(OUTPUT_DIR, allHashesByDoc, preservedDirs);

  return totalBlocks;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  extractDocumentationTests()
    .then(count => {
      console.log(`\n✅ Successfully extracted ${count} documentation examples`);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}
