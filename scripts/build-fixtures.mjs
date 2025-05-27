#!/usr/bin/env node
/**
 * Enhanced Fixture Generator
 * 
 * Generates test fixtures from Mlld example cases with improved organization.
 * Features:
 * - Clean slate: Removes old fixtures to prevent staleness
 * - Organized structure: Mirrors test case organization
 * - Error/warning fixtures: Supports exceptions and warnings
 * - Auto-copy examples: Copies valid examples from examples/ directory
 * - Generated naming: Uses .generated-fixture.json to prevent accidental edits
 * - Index generation: Creates TypeScript index files for clean imports
 * 
 * Usage:
 *   node scripts/build-fixtures.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '../grammar/parser/parser.js';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
// Note: Output generation requires compiled interpreter - will be handled post-build

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PROJECT_ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(PROJECT_ROOT, 'tests', 'cases');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures');
const EXAMPLES_DIR = path.join(PROJECT_ROOT, 'examples');
const EXAMPLES_MD = path.join(CASES_DIR, 'EXAMPLES.md');

// Main entry point
async function main() {
  try {
    console.log('Enhanced Fixture Generator');
    console.log('===========================');
    console.log(`Input: ${CASES_DIR}`);
    console.log(`Output: ${FIXTURES_DIR}`);
    console.log(`Examples: ${EXAMPLES_DIR}`);
    console.log('');
    
    // Step 1: Clean slate - remove old fixtures
    console.log('🧹 Cleaning old fixtures...');
    await cleanFixtures();
    
    // Step 2: Copy examples to test cases
    console.log('📋 Copying examples to test cases...');
    await copyExamplesToTests();
    
    // Step 3: Process all test cases
    console.log('🏗️  Processing test cases...');
    const stats = await processAllCases();
    
    // Step 4: Generate index files
    console.log('📝 Generating index files...');
    await generateIndexFiles();
    
    // Step 5: Build EXAMPLES.md
    console.log('📚 Building documentation...');
    await buildExamplesMarkdown();
    
    console.log('\n✅ Done!');
    console.log(`   Processed ${stats.total} examples`);
    console.log(`   Generated ${stats.fixtures} fixtures`);
    console.log(`   Skipped ${stats.skipped} files`);
    console.log(`   Updated ${EXAMPLES_MD}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Clean slate: Remove all old fixtures to prevent staleness
 */
async function cleanFixtures() {
  try {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    console.log('  ✓ Cleaned fixtures directory');
  } catch (error) {
    console.log('  ℹ️ No existing fixtures to clean');
  }
}

/**
 * Copy valid examples from examples/ to tests/cases/valid/examples/
 * Cleans up old example files but preserves test files (expected.md, error.md, etc.)
 */
async function copyExamplesToTests() {
  const targetDir = path.join(CASES_DIR, 'valid', 'examples');
  await fs.mkdir(targetDir, { recursive: true });
  
  try {
    // Get current .mld files from examples
    const exampleFiles = await fs.readdir(EXAMPLES_DIR);
    const mlldFiles = exampleFiles.filter(f => f.endsWith('.mld') && !f.startsWith('invalid-'));
    const expectedMdFiles = new Set(mlldFiles.map(f => f.replace('.mld', '.md')));
    
    // Clean up old example files (but preserve test files)
    try {
      const existingFiles = await fs.readdir(targetDir);
      for (const file of existingFiles) {
        // Only remove .md files that would be generated from .mld files
        // but don't match current .mld files (orphaned examples)
        // Preserve files like expected.md, error.md, output.md, etc.
        if (file.endsWith('.md') && 
            !expectedMdFiles.has(file) && 
            !file.includes('expected') && 
            !file.includes('error') && 
            !file.includes('output') &&
            !file.includes('warning')) {
          await fs.unlink(path.join(targetDir, file));
          console.log(`    🗑️ Removed orphaned example: ${file}`);
        }
      }
    } catch (error) {
      // Directory might not exist yet, that's fine
    }
    
    // Copy current .mld files
    let copied = 0;
    for (const file of mlldFiles) {
      const sourcePath = path.join(EXAMPLES_DIR, file);
      const targetPath = path.join(targetDir, file.replace('.mld', '.md'));
      
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(targetPath, content);
      copied++;
    }
    
    console.log(`  ✓ Copied ${copied} examples to test cases`);
  } catch (error) {
    console.log(`  ⚠️ Could not copy examples: ${error.message}`);
  }
}

/**
 * Generate TypeScript index files for clean imports
 */
async function generateIndexFiles() {
  // Get all fixture directories
  const categories = ['valid', 'exceptions', 'warnings', 'invalid'];
  
  for (const category of categories) {
    const categoryDir = path.join(FIXTURES_DIR, category);
    
    try {
      await fs.access(categoryDir);
      await generateCategoryIndex(categoryDir, category);
    } catch {
      // Category doesn't exist, skip
    }
  }
  
  // Generate top-level index
  await generateTopLevelIndex();
  console.log('  ✓ Generated TypeScript index files');
}

/**
 * Generate index file for a category directory
 */
async function generateCategoryIndex(categoryDir, categoryName) {
  const entries = await fs.readdir(categoryDir, { withFileTypes: true });
  const subDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
  
  const exports = [];
  
  for (const subDir of subDirs) {
    const subDirPath = path.join(categoryDir, subDir);
    
    try {
      const files = await fs.readdir(subDirPath);
      const fixtureFiles = files.filter(f => f.endsWith('.generated-fixture.json'));
      
      if (fixtureFiles.length > 0) {
        // Generate index for subdirectory
        await generateSubdirIndex(subDirPath, subDir, fixtureFiles);
        exports.push(`export * from './${subDir}';`);
      }
    } catch {
      // Skip directories we can't read
    }
  }
  
  if (exports.length > 0) {
    const indexContent = [
      `// Generated index for ${categoryName} fixtures`,
      '// This file is auto-generated. Do not edit manually.',
      '',
      ...exports,
      ''
    ].join('\n');
    
    await fs.writeFile(path.join(categoryDir, 'index.ts'), indexContent);
  }
}

/**
 * Generate index file for a subdirectory
 */
async function generateSubdirIndex(subDirPath, subDirName, fixtureFiles) {
  const exports = [];
  
  for (const file of fixtureFiles) {
    const fixtureName = file.replace('.generated-fixture.json', '');
    const exportName = toCamelCase(fixtureName);
    exports.push(`export { default as ${exportName} } from './${file}';`);
  }
  
  if (exports.length > 0) {
    const indexContent = [
      `// Generated index for ${subDirName} fixtures`,
      '// This file is auto-generated. Do not edit manually.',
      '',
      ...exports,
      ''
    ].join('\n');
    
    await fs.writeFile(path.join(subDirPath, 'index.ts'), indexContent);
  }
}

/**
 * Generate top-level index file
 */
async function generateTopLevelIndex() {
  const categories = ['valid', 'exceptions', 'warnings', 'invalid'];
  const exports = [];
  
  for (const category of categories) {
    const categoryDir = path.join(FIXTURES_DIR, category);
    
    try {
      await fs.access(categoryDir);
      exports.push(`export * as ${category} from './${category}';`);
    } catch {
      // Category doesn't exist, skip
    }
  }
  
  if (exports.length > 0) {
    const indexContent = [
      '// Generated top-level index for all fixtures',
      '// This file is auto-generated. Do not edit manually.',
      '',
      ...exports,
      ''
    ].join('\n');
    
    await fs.writeFile(path.join(FIXTURES_DIR, 'index.ts'), indexContent);
  }
}

/**
 * Convert kebab-case to camelCase for export names
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Process all example cases and generate fixtures
 */
async function processAllCases() {
  const stats = { total: 0, fixtures: 0, skipped: 0 };
  
  // Process each category
  const categories = ['valid', 'exceptions', 'warnings', 'invalid'];
  
  for (const category of categories) {
    const categoryPath = path.join(CASES_DIR, category);
    
    try {
      await fs.access(categoryPath);
      console.log(`\nProcessing ${category}/`);
      
      const categoryStats = await processCategoryDirectory(categoryPath, category);
      stats.total += categoryStats.total;
      stats.fixtures += categoryStats.fixtures;
      stats.skipped += categoryStats.skipped;
    } catch {
      console.log(`\nSkipping ${category}/ (doesn't exist)`);
    }
  }
  
  return stats;
}

/**
 * Process a category directory (valid, exceptions, warnings, invalid)
 */
async function processCategoryDirectory(categoryPath, categoryName) {
  const stats = { total: 0, fixtures: 0, skipped: 0 };
  
  if (categoryName === 'valid') {
    // For valid cases, we have directive-based subdirectories (add, text, run, etc.)
    // plus some special directories like examples
    const directiveEntries = await fs.readdir(categoryPath, { withFileTypes: true });
    const directiveDirs = directiveEntries.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const directiveDir of directiveDirs) {
      const directivePath = path.join(categoryPath, directiveDir);
      
      // Special handling for examples directory - process .md files directly
      if (directiveDir === 'examples') {
        const processed = await processExampleDirectory(directivePath, categoryName, 'examples');
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
        continue;
      }
      
      // Check if this directory contains .md files directly (like exec-parameterized-command)
      const directEntries = await fs.readdir(directivePath);
      const hasDirectMdFiles = directEntries.some(f => f.startsWith('example') && f.endsWith('.md'));
      
      if (hasDirectMdFiles) {
        // Process this directory directly
        const testName = directiveDir;
        const processed = await processExampleDirectory(directivePath, categoryName, testName, null);
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
      } else {
        // Get all subdirectories within the directive directory
        const subEntries = await fs.readdir(directivePath, { withFileTypes: true });
        const subDirs = subEntries.filter(d => d.isDirectory()).map(d => d.name);
        
        for (const subDir of subDirs) {
          const exampleDir = path.join(directivePath, subDir);
          const testName = `${directiveDir}-${subDir}`;
          const processed = await processExampleDirectory(exampleDir, categoryName, testName, directiveDir);
          stats.total += processed.total;
          stats.fixtures += processed.fixtures;
          stats.skipped += processed.skipped;
        }
      }
    }
  } else {
    // For other categories (exceptions, warnings, invalid), process directly
    const entries = await fs.readdir(categoryPath, { withFileTypes: true });
    const subDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const subDir of subDirs) {
      const exampleDir = path.join(categoryPath, subDir);
      const processed = await processExampleDirectory(exampleDir, categoryName, subDir);
      stats.total += processed.total;
      stats.fixtures += processed.fixtures;
      stats.skipped += processed.skipped;
    }
  }
  
  return stats;
}

/**
 * Process a single example directory
 */
async function processExampleDirectory(dirPath, category, name, directive = null) {
  const stats = { total: 0, fixtures: 0, skipped: 0 };
  
  // Look for example*.md files (or copied .mld files in examples directory)
  const files = await fs.readdir(dirPath);
  const exampleFiles = name === 'examples' ? 
    files.filter(f => f.endsWith('.md') && !f.startsWith('invalid-') && !f.includes('-output') && !f.includes('.o.')) :
    files.filter(f => f.startsWith('example') && f.endsWith('.md'));
  
  // Ensure output directory exists - organize by directive for valid cases
  const outputDir = directive ? 
    path.join(FIXTURES_DIR, category, directive) : 
    path.join(FIXTURES_DIR, category, name);
  await fs.mkdir(outputDir, { recursive: true });
  
  for (const file of exampleFiles) {
    stats.total++;
    
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Extract related files based on category
    let expectedContent = null;
    let errorContent = null;
    let warningContent = null;
    
    if (category === 'valid') {
      if (name === 'examples') {
        // Examples don't have expected files - they're for demonstrating syntax
        expectedContent = null;
      } else {
        // Look for expected.md
        const expectedFile = file.replace('example', 'expected');
        if (files.includes(expectedFile)) {
          expectedContent = await fs.readFile(path.join(dirPath, expectedFile), 'utf-8');
        }
      }
    } else if (category === 'exceptions') {
      // Look for error.md
      if (files.includes('error.md')) {
        errorContent = await fs.readFile(path.join(dirPath, 'error.md'), 'utf-8');
      }
    } else if (category === 'warnings') {
      // Look for warning.md
      if (files.includes('warning.md')) {
        warningContent = await fs.readFile(path.join(dirPath, 'warning.md'), 'utf-8');
      }
    }
    
    // Generate fixture name
    let fixtureName = `${name}`;
    if (name === 'examples') {
      // For examples directory, use the filename as the fixture name
      fixtureName = file.replace('.md', '');
    } else if (file !== 'example.md') {
      // Handle variants like example-multiline.md
      const variant = file.replace('example-', '').replace('.md', '');
      fixtureName += `-${variant}`;
    }
    fixtureName += '.generated-fixture.json';
    
    try {
      // Parse the content (may fail for invalid/exceptions, which is expected)
      let ast = null;
      let parseError = null;
      
      try {
        ast = await parse(content);
      } catch (error) {
        parseError = {
          message: error.message,
          location: error.location || null
        };
      }
      
      // Note: Actual output generation will be handled by separate post-build script
      let actualOutput = null;
      
      // Create fixture
      const fixture = {
        name: fixtureName.replace('.generated-fixture.json', ''),
        description: `Test fixture for ${category}/${name}`,
        category,
        subcategory: name,
        input: content,
        expected: expectedContent,
        expectedError: errorContent,
        expectedWarning: warningContent,
        actualOutput: actualOutput, // Include generated output for smoke tests
        ast: ast,
        parseError: parseError
      };
      
      // Write fixture
      const fixturePath = path.join(outputDir, fixtureName);
      await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2));
      
      console.log(`  ✓ ${fixtureName}`);
      stats.fixtures++;
    } catch (error) {
      console.log(`  ✗ ${file}: ${error.message}`);
      stats.skipped++;
    }
  }
  
  return stats;
}

/**
 * Build comprehensive EXAMPLES.md file
 */
async function buildExamplesMarkdown() {
  const lines = [
    '# Mlld Examples',
    '',
    'This file contains all test case examples organized by category.',
    'Generated by `tests/utils/ast-fixtures.js`',
    '',
    '## Table of Contents',
    ''
  ];
  
  const categories = new Map();
  
  // Collect all examples
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  const dirs = entries.filter(d => d.isDirectory()).sort();
  
  for (const dir of dirs) {
    const dirPath = path.join(CASES_DIR, dir.name);
    const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
    const subDirs = subEntries.filter(d => d.isDirectory()).sort();
    
    const examples = [];
    
    for (const subDir of subDirs) {
      const exampleDir = path.join(dirPath, subDir.name);
      const files = await fs.readdir(exampleDir);
      const exampleFiles = files.filter(f => f.startsWith('example') && f.endsWith('.md'));
      
      for (const file of exampleFiles) {
        const content = await fs.readFile(path.join(exampleDir, file), 'utf-8');
        const expectedFile = file.replace('example', 'expected');
        let expected = null;
        
        if (files.includes(expectedFile)) {
          expected = await fs.readFile(path.join(exampleDir, expectedFile), 'utf-8');
        }
        
        examples.push({
          subDir: subDir.name,
          file,
          content,
          expected
        });
      }
    }
    
    if (examples.length > 0) {
      categories.set(dir.name, examples);
    }
  }
  
  // Build TOC
  for (const [category, examples] of categories) {
    lines.push(`- [${capitalize(category)}](#${category})`);
    
    // Group by subdirectory
    const bySubDir = new Map();
    for (const ex of examples) {
      if (!bySubDir.has(ex.subDir)) {
        bySubDir.set(ex.subDir, []);
      }
      bySubDir.get(ex.subDir).push(ex);
    }
    
    for (const [subDir] of bySubDir) {
      lines.push(`  - [${capitalize(subDir)}](#${category}-${subDir})`);
    }
  }
  
  lines.push('');
  
  // Build content sections
  for (const [category, examples] of categories) {
    lines.push(`## ${capitalize(category)}`);
    lines.push('');
    
    // Group by subdirectory
    const bySubDir = new Map();
    for (const ex of examples) {
      if (!bySubDir.has(ex.subDir)) {
        bySubDir.set(ex.subDir, []);
      }
      bySubDir.get(ex.subDir).push(ex);
    }
    
    for (const [subDir, subExamples] of bySubDir) {
      lines.push(`### ${capitalize(category)} ${capitalize(subDir)}`);
      lines.push('');
      
      for (const ex of subExamples) {
        // Add variant name if not the base example
        if (ex.file !== 'example.md') {
          const variant = ex.file.replace('example-', '').replace('.md', '');
          lines.push(`#### ${capitalize(variant)} Variant`);
          lines.push('');
        }
        
        lines.push('**Input:**');
        lines.push('```mlld');
        lines.push(ex.content.trim());
        lines.push('```');
        lines.push('');
        
        if (ex.expected) {
          lines.push('**Expected Output:**');
          lines.push('```markdown');
          lines.push(ex.expected.trim());
          lines.push('```');
          lines.push('');
        }
      }
    }
  }
  
  // Write the file
  await fs.writeFile(EXAMPLES_MD, lines.join('\n'));
}

/**
 * Capitalize a string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}

// Run main
main().catch(console.error);