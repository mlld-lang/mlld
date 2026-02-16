#!/usr/bin/env node
/**
 * Extract mlld code blocks from documentation and create test cases
 * This runs as part of the build:fixtures process to ensure docs are always tested
 */

import fs from 'node:fs/promises';
import path from 'node:path';
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
            mode: blockMode
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
 * Clean directory but preserve expected.md files
 */
async function cleanDirectory(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively clean subdirectories
        await cleanDirectory(fullPath);
      } else if (entry.isFile()) {
        // Remove example.md, example.mld, and .description files
        if (entry.name === 'example.md' || entry.name === 'example.mld' || entry.name === '.description') {
          await fs.unlink(fullPath);
        }
        // Preserve expected.md, error.md, warning.md files
      }
    }
  } catch (error) {
    // Directory doesn't exist yet, that's fine
  }
}

/**
 * Process a documentation file and create test cases
 */
async function processDocFile(docPath, outputDir) {
  const content = await fs.readFile(docPath, 'utf-8');
  const fileName = path.basename(docPath, '.md');
  
  const blocks = extractMlldCodeBlocks(content, docPath);
  
  if (blocks.length === 0) {
    return { fileName, count: 0 };
  }
  
  // Create directory for this doc's tests
  const docTestDir = path.join(outputDir, fileName);
  await fs.mkdir(docTestDir, { recursive: true });
  
  // Create a test case for each code block
  for (const block of blocks) {
    // Create a subdirectory for each block (numbered)
    const blockDir = path.join(docTestDir, String(block.index).padStart(2, '0'));
    await fs.mkdir(blockDir, { recursive: true });

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
  
  return { fileName, count: blocks.length };
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
  await cleanDirectory(OUTPUT_DIR);

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

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
  }

  totalBlocks += atomBlocks;

  console.log(`  ✓ Extracted ${atomBlocks} mlld blocks from ${atomFiles.length} atoms`);
  for (const result of atomResults) {
    if (result.count > 0) {
      console.log(`    • atoms/${result.category}/${result.fileName}: ${result.count} blocks`);
    }
  }

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