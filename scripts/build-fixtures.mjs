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
import { extractDocumentationTests } from './extract-doc-tests.mjs';
// Note: Output generation requires compiled interpreter - will be handled post-build

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PROJECT_ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(PROJECT_ROOT, 'tests', 'cases');
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures');
const EXAMPLES_DIR = path.join(PROJECT_ROOT, 'examples');
const EXAMPLES_MD = path.join(CASES_DIR, 'EXAMPLES.md');

const CASE_DIRECTORY_HELPERS = new Set(['files']);

/**
 * @param {string} name
 * @returns {boolean}
 */
function isHelperCaseDirectory(name) {
  if (!name) return false;
  if (CASE_DIRECTORY_HELPERS.has(name)) return true;
  return name.startsWith('.') || name.startsWith('_');
}

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
    
    // Step 1: Extract documentation tests FIRST
    console.log('📖 Extracting documentation tests...');
    await extractDocumentationTests();
    
    // Step 2: Check existing fixtures (but don't wipe them)
    console.log('🔍 Checking existing fixtures...');
    await cleanOrphanedFixtures();
    
    // Step 3: Copy examples to test cases
    console.log('📋 Copying examples to test cases...');
    await copyExamplesToTests();
    
    // Step 4: Process all test cases
    console.log('🏗️  Processing test cases...');
    const stats = await processAllCases();
    
    // Step 5: Generate index files
    console.log('📝 Generating index files...');
    await generateIndexFiles();
    
    // Step 6: Build EXAMPLES.md
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
 * Copy valid examples from examples/ to tests/cases/examples/
 * Cleans up old example files but preserves test files (expected.md, error.md, etc.)
 */
async function copyExamplesToTests() {
  const targetDir = path.join(CASES_DIR, 'examples');
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
  // Get all directories in fixtures/
  const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true });
  const dirs = entries
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const exports = [];

  for (const dir of dirs) {
    const categoryDir = path.join(FIXTURES_DIR, dir);

    try {
      await fs.access(categoryDir);
      const safeName = dir.replace(/-/g, '_');
      exports.push(`export * as ${safeName} from './${dir}';`);
    } catch {
      // Directory doesn't exist, skip
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

  // Get all directories in tests/cases/
  const entries = await fs.readdir(CASES_DIR, { withFileTypes: true });
  const specialCategories = ['exceptions', 'warnings', 'invalid'];
  const allDirs = entries
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => !isHelperCaseDirectory(name)); // Skip helper directories

  // Process each directory
  for (const dirName of allDirs) {
    const dirPath = path.join(CASES_DIR, dirName);
    const isSpecialCategory = specialCategories.includes(dirName);

    try {
      await fs.access(dirPath);
      console.log(`\nProcessing ${dirName}/`);

      // Determine category: special categories keep their name, others are 'valid'
      const category = isSpecialCategory ? dirName : 'valid';

      const categoryStats = await processCategoryDirectory(dirPath, category, dirName);
      stats.total += categoryStats.total;
      stats.fixtures += categoryStats.fixtures;
      stats.skipped += categoryStats.skipped;
    } catch {
      console.log(`\nSkipping ${dirName}/ (doesn't exist)`);
    }
  }

  return stats;
}

/**
 * Process a category directory
 * @param {string} dirPath - The path to the directory
 * @param {string} categoryName - The category ('valid', 'exceptions', 'warnings', 'invalid')
 * @param {string} dirName - The actual directory name
 */
async function processCategoryDirectory(dirPath, categoryName, dirName) {
  const stats = { total: 0, fixtures: 0, skipped: 0 };

  if (categoryName === 'valid') {
    // For valid tests (regular directories at root level)
    // Check if this directory contains example.md files directly
    const entries = await fs.readdir(dirPath);
    const hasDirectMdFiles = entries.some(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));

    if (hasDirectMdFiles) {
      // This directory contains test files directly
      const processed = await processExampleDirectory(dirPath, categoryName, dirName);
      stats.total += processed.total;
      stats.fixtures += processed.fixtures;
      stats.skipped += processed.skipped;
    } else if (dirName === 'examples') {
      // Special handling for examples directory - process .md files directly
      const processed = await processExampleDirectory(dirPath, categoryName, 'examples');
      stats.total += processed.total;
      stats.fixtures += processed.fixtures;
      stats.skipped += processed.skipped;
    } else {
      // This directory contains subdirectories - process them
      await processTestCategory(dirPath, categoryName, dirName, stats);
    }
  } else {
    // For other categories (exceptions, warnings, invalid), process recursively
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const subDir of subDirs) {
      const subDirPath = path.join(dirPath, subDir);
      
      // Check if this subdirectory contains example.md files directly
      const subEntries = await fs.readdir(subDirPath);
      const hasDirectMdFiles = subEntries.some(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));
      
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
    const hasDirectMdFiles = dirEntries.some(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));

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

  // Optional config per test directory
  const configPath = path.join(dirPath, 'config.json');
  let config = null;
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    // No config or invalid JSON; ignore
  }

  // Read .description file if present (contains source info for doc-extracted tests)
  const descriptionPath = path.join(dirPath, '.description');
  let sourceInfo = null;
  try {
    sourceInfo = (await fs.readFile(descriptionPath, 'utf-8')).trim();
  } catch (error) {
    // No .description file; ignore
  }

  // Check for skip files
  const skipFiles = files.filter(f => f === 'skip.md' || f.startsWith('skip-') && f.endsWith('.md'));
  if (skipFiles.length > 0) {
    // Read the skip reason from the first skip file
    const skipFile = skipFiles[0];
    const skipReason = await fs.readFile(path.join(dirPath, skipFile), 'utf-8');
    console.log(`  ⏭️  Skipping ${path.relative(CASES_DIR, dirPath)}: ${skipFile}`);
    if (process.env.VERBOSE) {
      console.log(`     Reason: ${skipReason.split('\n')[0]}`);
    }
    stats.skipped++;
    return stats;
  }

  const exampleFiles = name === 'examples' ?
    files.filter(f => (f.endsWith('.md') || f.endsWith('.mld')) && !f.startsWith('invalid-') && !f.includes('-output') && !f.includes('.o.')) :
    files.filter(f => f.startsWith('example') && (f.endsWith('.md') || f.endsWith('.mld')));
  
  // Determine output directory - mirrors the structure under tests/cases/
  const testPath = path.relative(CASES_DIR, dirPath);
  const outputDir = path.join(FIXTURES_DIR, testPath);
  
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

    // Allow any fixture to specify error expectations via local error.md (and variants)
    if (!errorContent) {
      const errorFile =
        (file === 'example.md' || file === 'example.mld')
          ? 'error.md'
          : file.replace('example-', 'error-').replace('.mld', '.md');
      if (files.includes(errorFile)) {
        errorContent = await fs.readFile(path.join(dirPath, errorFile), 'utf-8');
      }
    }
    
    // Generate fixture filename (just for the file, not the full name)
    let fixtureFileName;
    if (name === 'examples') {
      // For examples directory, use the filename as the fixture name
      fixtureFileName = file.replace('.md', '').replace('.mld', '') + '.generated-fixture.json';
    } else if (file !== 'example.md' && file !== 'example.mld') {
      // Handle variants like example-multiline.md
      const variant = file.replace('example-', '').replace('.md', '').replace('.mld', '');
      fixtureFileName = `${name}-${variant}.generated-fixture.json`;
    } else {
      // For standard example.md or example.mld files, use the directory name
      fixtureFileName = `${name}.generated-fixture.json`;
    }
    
    try {
      // Parse the content (may fail for invalid/exceptions, which is expected)
      let ast = null;
      let parseError = null;
      // Infer mode from file extension or config
      const inferredMode = file.endsWith('.mld') ? 'strict' : (config?.mode || undefined);
      const parseOptions = inferredMode ? { mode: inferredMode } : undefined;
      
      try {
        ast = parseOptions ? await parse(content, parseOptions) : await parse(content);
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
      
      // Create fixture with full path as name
      const fullPath = path.relative(CASES_DIR, dirPath);

      // For variant files, include the variant in the name
      let fixtureName = fullPath;
      if (file !== 'example.md' && file !== 'example.mld' && file.startsWith('example-')) {
        const variant = file.replace('example-', '').replace('.md', '').replace('.mld', '');
        fixtureName = `${fullPath}-${variant}`;
      }

      const description =
        (config && typeof config.description === 'string' && config.description.trim())
          ? config.description.trim()
          : `Test fixture for ${fixtureName}`;

      // The fixture name should be unique for each test
      const fixture = {
        name: fixtureName,
        description,
        category,
        subcategory: name,
        input: content,
        expected: expectedContent,
        expectedError: errorContent,
        expectedWarning: warningContent,
        actualOutput: actualOutput, // Include generated output for smoke tests
        ast: ast,
        parseError: parseError,
        ...(config?.env ? { environmentVariables: config.env } : {}),
        ...(inferredMode ? { mlldMode: inferredMode } : {}),
        ...(sourceInfo ? { sourceInfo } : {})
      };
      
      // Write fixture only if content changed
      const fixturePath = path.join(outputDir, fixtureFileName);
      const wasUpdated = await writeFixtureIfChanged(fixturePath, fixture);

      if (wasUpdated) {
        console.log(`  ✓ ${fixtureFileName} (updated)`);
      } else {
        console.log(`  ✓ ${fixtureFileName} (unchanged)`);
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
 * Build comprehensive EXAMPLES.md file from valid examples only
 */
async function buildExamplesMarkdown() {
  const lines = [
    '# Mlld Examples',
    '',
    'This file contains all valid test case examples organized by directory structure.',
    'Generated by `scripts/build-fixtures.mjs`',
    '',
    '## Table of Contents',
    ''
  ];
  
  // Recursively find all example files under valid/
  async function findExampleFiles(dir, basePath = '') {
    const results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Check if this directory contains example*.md files
    const exampleFiles = entries.filter(e => 
      e.isFile() && e.name.startsWith('example') && e.name.endsWith('.md')
    );
    
    if (exampleFiles.length > 0) {
      // This directory contains examples
      for (const file of exampleFiles) {
        const content = await fs.readFile(path.join(dir, file.name), 'utf-8');
        const expectedFile = file.name.replace('example', 'expected');
        let expected = null;
        
        const allFiles = entries.map(e => e.name);
        if (allFiles.includes(expectedFile)) {
          expected = await fs.readFile(path.join(dir, expectedFile), 'utf-8');
        }
        
        results.push({
          path: basePath,
          file: file.name,
          content,
          expected,
          fullPath: path.join(dir, file.name)
        });
      }
    }
    
    // Recursively process subdirectories
    const subDirs = entries.filter(e => e.isDirectory());
    for (const subDir of subDirs) {
      // Skip special categories at root level
      if (basePath === '' && ['exceptions', 'warnings', 'invalid', 'files'].includes(subDir.name)) {
        continue;
      }
      const subPath = basePath ? `${basePath}/${subDir.name}` : subDir.name;
      const subResults = await findExampleFiles(path.join(dir, subDir.name), subPath);
      results.push(...subResults);
    }
    
    return results;
  }
  
  // Build a tree structure from flat paths
  function buildTree(examples) {
    const tree = {};
    
    for (const ex of examples) {
      const parts = ex.path ? ex.path.split('/') : [];
      let current = tree;
      
      for (const part of parts) {
        if (!current[part]) {
          current[part] = { _examples: [], _children: {} };
        }
        current = current[part]._children;
      }
      
      // Add example to the leaf node
      const leafKey = parts.length > 0 ? parts[parts.length - 1] : '_root';
      if (!tree[leafKey]) {
        tree[leafKey] = { _examples: [], _children: {} };
      }
      
      // Store example at the correct level
      let targetNode = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        targetNode = targetNode[parts[i]]._children;
      }
      if (parts.length > 0) {
        if (!targetNode[parts[parts.length - 1]]) {
          targetNode[parts[parts.length - 1]] = { _examples: [], _children: {} };
        }
        targetNode[parts[parts.length - 1]]._examples.push(ex);
      } else {
        if (!tree._root) {
          tree._root = { _examples: [], _children: {} };
        }
        tree._root._examples.push(ex);
      }
    }
    
    return tree;
  }
  
  // Generate TOC from tree
  function generateTOC(tree, prefix = '', indent = 0) {
    const tocLines = [];
    const sortedKeys = Object.keys(tree).sort();
    
    for (const key of sortedKeys) {
      if (key === '_root') continue;
      
      const node = tree[key];
      const anchor = prefix ? `${prefix}-${key}` : key;
      const indentStr = '  '.repeat(indent);
      
      tocLines.push(`${indentStr}- [${capitalize(key)}](#${anchor.toLowerCase().replace(/[^a-z0-9-]/g, '-')})`);
      
      // Add children to TOC
      if (node._children && Object.keys(node._children).length > 0) {
        tocLines.push(...generateTOC(node._children, anchor, indent + 1));
      }
    }
    
    return tocLines;
  }
  
  // Generate content sections from tree
  function generateContent(tree, prefix = '', level = 2) {
    const contentLines = [];
    const sortedKeys = Object.keys(tree).sort();
    
    for (const key of sortedKeys) {
      if (key === '_root') {
        // Handle root-level examples
        const node = tree[key];
        if (node._examples.length > 0) {
          for (const ex of node._examples) {
            if (ex.file !== 'example.md' && ex.file !== 'example.mld') {
              const variant = ex.file.replace('example-', '').replace('.md', '').replace('.mld', '');
              contentLines.push(`${'#'.repeat(level + 1)} ${capitalize(variant)} Variant`);
              contentLines.push('');
            }
            
            contentLines.push('**Input:**');
            contentLines.push('```mlld');
            contentLines.push(ex.content.trim());
            contentLines.push('```');
            contentLines.push('');
            
            if (ex.expected) {
              contentLines.push('**Expected Output:**');
              contentLines.push('```markdown');
              contentLines.push(ex.expected.trim());
              contentLines.push('```');
              contentLines.push('');
            }
          }
        }
        continue;
      }
      
      const node = tree[key];
      const title = prefix ? `${prefix} / ${capitalize(key)}` : capitalize(key);
      
      contentLines.push(`${'#'.repeat(level)} ${title}`);
      contentLines.push('');
      
      // Add examples for this node
      if (node._examples.length > 0) {
        for (const ex of node._examples) {
          if (ex.file !== 'example.md' && ex.file !== 'example.mld') {
            const variant = ex.file.replace('example-', '').replace('.md', '').replace('.mld', '');
            contentLines.push(`${'#'.repeat(level + 1)} ${capitalize(variant)} Variant`);
            contentLines.push('');
          }
          
          contentLines.push('**Input:**');
          contentLines.push('```mlld');
          contentLines.push(ex.content.trim());
          contentLines.push('```');
          contentLines.push('');
          
          if (ex.expected) {
            contentLines.push('**Expected Output:**');
            contentLines.push('```markdown');
            contentLines.push(ex.expected.trim());
            contentLines.push('```');
            contentLines.push('');
          }
        }
      }
      
      // Process children
      if (node._children && Object.keys(node._children).length > 0) {
        contentLines.push(...generateContent(node._children, title, level + 1));
      }
    }
    
    return contentLines;
  }
  
  // Process only valid examples
  // Find all example files in tests/cases/ (excluding special categories)
  const examples = await findExampleFiles(CASES_DIR);
  
  if (examples.length === 0) {
    console.log('No valid examples found');
    return;
  }
  
  console.log(`Found ${examples.length} valid examples`);
  
  // Build tree structure
  const tree = buildTree(examples);
  
  // Generate TOC
  const tocLines = generateTOC(tree);
  lines.push(...tocLines);
  lines.push('');
  
  // Generate content
  lines.push('## Examples');
  lines.push('');
  const contentLines = generateContent(tree);
  lines.push(...contentLines);
  
  // Write the file
  await fs.writeFile(EXAMPLES_MD, lines.join('\n'));
  console.log(`Generated EXAMPLES.md with ${examples.length} examples`);
}

/**
 * Capitalize a string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}

// Run main
main().catch(console.error);
