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
import parser from '../grammar/generated/parser/parser.js';
const parse = parser.parse;
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

/**
 * Normalize nodeIds in AST for stable fixture generation
 * Replaces random UUIDs with predictable IDs based on content
 */
function normalizeNodeIds(obj, idCounter = { value: 1 }) {
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeNodeIds(item, idCounter));
  }
  
  if (obj && typeof obj === 'object') {
    const normalized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'nodeId' && typeof value === 'string') {
        // Replace UUID with predictable ID
        normalized[key] = `node-${idCounter.value++}`;
      } else if (key === 'value' && typeof value === 'string' && value.includes('"nodeId"')) {
        // Special handling for raw.value fields that contain stringified JSON with nodeIds
        try {
          // Parse the JSON, normalize it, and re-stringify
          const parsed = JSON.parse(value);
          const normalizedParsed = normalizeNodeIds(parsed, idCounter);
          normalized[key] = JSON.stringify(normalizedParsed, null, 2);
        } catch (e) {
          // If parsing fails, just keep the original value
          normalized[key] = value;
        }
      } else {
        normalized[key] = normalizeNodeIds(value, idCounter);
      }
    }
    
    return normalized;
  }
  
  return obj;
}

/**
 * Write fixture file only if content has changed
 * This prevents unnecessary git modifications
 */
async function writeFixtureIfChanged(filePath, content) {
  let existingContent = '';
  
  try {
    existingContent = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    // File doesn't exist, will write
  }
  
  // Normalize nodeIds for stable comparison
  const normalizedContent = normalizeNodeIds(content);
  const newContent = JSON.stringify(normalizedContent, null, 2);
  
  if (existingContent !== newContent) {
    await fs.writeFile(filePath, newContent);
    return true; // File was updated
  }
  
  return false; // No change needed
}

// Main entry point
async function main() {
  try {
    console.log('Enhanced Fixture Generator');
    console.log('===========================');
    console.log(`Input: ${CASES_DIR}`);
    console.log(`Output: ${FIXTURES_DIR}`);
    console.log(`Examples: ${EXAMPLES_DIR}`);
    console.log('');
    
    // Step 1: Check existing fixtures (but don't wipe them)
    console.log('🔍 Checking existing fixtures...');
    await cleanOrphanedFixtures();
    
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
 * Clean orphaned fixtures: Remove fixtures that no longer have corresponding test cases
 * This is more surgical than wiping everything
 */
async function cleanOrphanedFixtures() {
  try {
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    
    // Get all current fixture files
    let existingFixtures = [];
    try {
      const fixtureFiles = await fs.readdir(FIXTURES_DIR);
      existingFixtures = fixtureFiles.filter(f => f.endsWith('.generated-fixture.json'));
    } catch (error) {
      // Directory doesn't exist yet, that's fine
      console.log('  ℹ️ No existing fixtures directory');
      return;
    }
    
    if (existingFixtures.length === 0) {
      console.log('  ℹ️ No existing fixtures to check');
      return;
    }
    
    // TODO: In future, we could check which fixtures are orphaned
    // For now, we'll rely on writeFixtureIfChanged to only update what's needed
    console.log(`  ℹ️ Found ${existingFixtures.length} existing fixtures (will update only if changed)`);
    
  } catch (error) {
    console.log('  ⚠️ Error checking existing fixtures:', error.message);
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
  // Handle special case where hyphen is followed by a number
  // e.g., "complex-test-1-nested-imports" -> "complexTest1NestedImports"
  return str
    .replace(/-(\d)/g, '$1') // Remove hyphen before numbers
    .replace(/-([a-z])/g, (g) => g[1].toUpperCase()); // Capitalize letters after hyphens
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
    // Process all directories under valid/
    const topLevelEntries = await fs.readdir(categoryPath, { withFileTypes: true });
    const topLevelDirs = topLevelEntries.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const topLevelDir of topLevelDirs) {
      const topLevelPath = path.join(categoryPath, topLevelDir);
      
      // Special handling for examples directory - process .md files directly
      if (topLevelDir === 'examples') {
        const processed = await processExampleDirectory(topLevelPath, categoryName, 'examples');
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
        continue;
      }
      
      // Check if this directory contains test subdirectories
      const entries = await fs.readdir(topLevelPath, { withFileTypes: true });
      const hasSubDirs = entries.some(e => e.isDirectory());
      const hasDirectMdFiles = entries.some(f => f.name.startsWith('example') && f.name.endsWith('.md'));
      
      if (hasSubDirs) {
        // This is a category directory (like directives, features, etc)
        // Process all subdirectories within it
        await processTestCategory(topLevelPath, categoryName, topLevelDir, stats);
      } else if (hasDirectMdFiles) {
        // This directory contains test files directly
        const processed = await processExampleDirectory(topLevelPath, categoryName, topLevelDir);
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
      }
    }
  } else {
    // For other categories (exceptions, warnings, invalid), process recursively
    const entries = await fs.readdir(categoryPath, { withFileTypes: true });
    const subDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const subDir of subDirs) {
      const subDirPath = path.join(categoryPath, subDir);
      
      // Check if this subdirectory contains example.md files directly
      const subEntries = await fs.readdir(subDirPath);
      const hasDirectMdFiles = subEntries.some(f => f.startsWith('example') && f.endsWith('.md'));
      
      if (hasDirectMdFiles) {
        // Process this directory directly
        const processed = await processExampleDirectory(subDirPath, categoryName, subDir);
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
      } else {
        // This subdirectory contains more subdirectories, process them
        const nestedEntries = await fs.readdir(subDirPath, { withFileTypes: true });
        const nestedDirs = nestedEntries.filter(d => d.isDirectory()).map(d => d.name);
        
        for (const nestedDir of nestedDirs) {
          const exampleDir = path.join(subDirPath, nestedDir);
          const testName = `${subDir}-${nestedDir}`;
          const processed = await processExampleDirectory(exampleDir, categoryName, testName);
          stats.total += processed.total;
          stats.fixtures += processed.fixtures;
          stats.skipped += processed.skipped;
        }
      }
    }
  }
  
  return stats;
}

/**
 * Process a test category (directives, features, integration)
 */
async function processTestCategory(categoryPath, validCategory, categoryType, stats) {
  const entries = await fs.readdir(categoryPath, { withFileTypes: true });
  const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);
  
  for (const dir of dirs) {
    const dirPath = path.join(categoryPath, dir);
    const dirEntries = await fs.readdir(dirPath);
    const hasDirectMdFiles = dirEntries.some(f => f.startsWith('example') && f.endsWith('.md'));
    
    if (hasDirectMdFiles) {
      // This is a test directory
      let testName;
      if (categoryType === 'directives') {
        // For directives, keep the directive prefix
        testName = dir;
      } else {
        // For features and integration, use the directory name as-is
        testName = dir;
      }
      
      const processed = await processExampleDirectory(dirPath, validCategory, testName, categoryType);
      stats.total += processed.total;
      stats.fixtures += processed.fixtures;
      stats.skipped += processed.skipped;
    } else {
      // This directory contains subdirectories
      const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
      const subDirs = subEntries.filter(d => d.isDirectory()).map(d => d.name);
      
      for (const subDir of subDirs) {
        const subDirPath = path.join(dirPath, subDir);
        
        // Generate test name based on category type
        let testName;
        if (categoryType === 'directives') {
          // For directives, use directive-testname format
          testName = `${dir}-${subDir}`;
        } else {
          // For features/integration, check if we need to include parent
          if (dir === subDir || subDir.startsWith(dir)) {
            testName = subDir;
          } else {
            testName = `${dir}-${subDir}`;
          }
        }
        
        const processed = await processExampleDirectory(subDirPath, validCategory, testName, categoryType);
        stats.total += processed.total;
        stats.fixtures += processed.fixtures;
        stats.skipped += processed.skipped;
      }
    }
  }
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
  
  // Determine output directory based on the new test structure
  let outputDir;
  
  if (category === 'valid') {
    // For valid tests, we need to preserve the category structure
    const testPath = path.relative(path.join(PROJECT_ROOT, 'tests', 'cases'), dirPath);
    const pathParts = testPath.split(path.sep);
    
    // Always preserve the full path structure for all valid tests
    outputDir = path.join(FIXTURES_DIR, testPath);
  } else {
    // For other categories (exceptions, warnings, invalid), keep existing logic
    outputDir = directive ? 
      path.join(FIXTURES_DIR, category, directive) : 
      path.join(FIXTURES_DIR, category, name);
  }
  
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
    } else if (category === 'exceptions' || category === 'invalid') {
      // For invalid tests, we'll generate the error by running the pattern
      if (category === 'invalid') {
        // We'll handle this after parsing when we have the parseError
        errorContent = null; // Will be set later if we have a parse error
      } else {
        // For exceptions, still look locally
        if (files.includes('error.md')) {
          errorContent = await fs.readFile(path.join(dirPath, 'error.md'), 'utf-8');
        }
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
        
        // For invalid category, use error.md as the expected error
        if (category === 'invalid') {
          const errorMdPath = path.join(PROJECT_ROOT, 'errors', 'parse', name, 'error.md');
          try {
            errorContent = await fs.readFile(errorMdPath, 'utf-8');
          } catch (readErr) {
            // Try local error.md for tests without patterns
            const localErrorPath = path.join(dirPath, 'error.md');
            try {
              errorContent = await fs.readFile(localErrorPath, 'utf-8');
              console.warn(`  ⚠️  Using local error.md for ${name} - should have pattern in errors/parse/${name}/`);
            } catch (localErr) {
              console.warn(`  ⚠️  No error.md found for ${name}`);
            }
          }
        }
      }
      
      // Note: Actual output generation will be handled by separate post-build script
      const actualOutput = null;
      
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
      
      // Write fixture only if content changed
      const fixturePath = path.join(outputDir, fixtureName);
      const wasUpdated = await writeFixtureIfChanged(fixturePath, fixture);
      
      if (wasUpdated) {
        console.log(`  ✓ ${fixtureName} (updated)`);
      } else {
        console.log(`  ✓ ${fixtureName} (unchanged)`);
      }
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