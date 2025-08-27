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
 * Extract mlld code blocks from a markdown file
 */
function extractMlldCodeBlocks(content, filePath) {
  const blocks = [];
  const lines = content.split('\n');
  
  let inCodeBlock = false;
  let currentBlock = [];
  let blockStartLine = 0;
  let blockLanguage = '';
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
        if (lang === 'mlld') {
          inCodeBlock = true;
          blockLanguage = lang;
          currentBlock = [];
          blockStartLine = i + 1;
          blockIndex++;
        }
      } else if (inCodeBlock && blockLanguage === 'mlld') {
        // Ending an mlld code block
        inCodeBlock = false;
        
        const code = currentBlock.join('\n');
        
        // Skip empty blocks or blocks that are just comments
        const hasDirective = code.split('\n').some(l => l.trim().startsWith('/'));
        
        if (code.trim() && hasDirective) {
          blocks.push({
            code,
            line: blockStartLine,
            description: lastHeading || `Block ${blockIndex}`,
            index: blockIndex
          });
        }
        
        currentBlock = [];
        blockLanguage = '';
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
        // Only remove example.md and .description files
        if (entry.name === 'example.md' || entry.name === '.description') {
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
    
    // Write the example file
    const examplePath = path.join(blockDir, 'example.md');
    await fs.writeFile(examplePath, block.code);
    
    // Write a description file for context
    const descPath = path.join(blockDir, '.description');
    const description = `From ${fileName}.md line ${block.line}: ${block.description}`;
    await fs.writeFile(descPath, description);
  }
  
  return { fileName, count: blocks.length };
}

/**
 * Extract documentation tests
 */
export async function extractDocumentationTests() {
  const DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'user');
  const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests', 'cases', 'valid', 'docs');
  
  console.log('📖 Extracting documentation code blocks...');
  
  // Clean existing doc tests (but preserve expected.md files)
  await cleanDirectory(OUTPUT_DIR);
  
  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Process each documentation file
  const docFiles = await fs.readdir(DOCS_DIR);
  const mdFiles = docFiles.filter(f => f.endsWith('.md') && !f.includes('-review'));
  
  let totalBlocks = 0;
  const results = [];
  
  for (const file of mdFiles) {
    const filePath = path.join(DOCS_DIR, file);
    const result = await processDocFile(filePath, OUTPUT_DIR);
    totalBlocks += result.count;
    results.push(result);
  }
  
  // Log summary
  console.log(`  ✓ Extracted ${totalBlocks} mlld blocks from ${mdFiles.length} docs`);
  for (const result of results) {
    if (result.count > 0) {
      console.log(`    • ${result.fileName}: ${result.count} blocks`);
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