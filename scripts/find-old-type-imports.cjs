#!/usr/bin/env node

/**
 * Script to find files importing from old type locations
 * 
 * This script searches for import statements referencing:
 * - @core/types-old
 * - @core/syntax/types-old
 * - Any other old type patterns that need to be migrated
 * 
 * Usage:
 * node scripts/find-old-type-imports.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Patterns to look for in imports
const OLD_TYPE_PATTERNS = [
  // Main syntax type imports - highest priority
  '@core/syntax/types',
  '@core/syntax/types/index',
  '@core/syntax/types/nodes',
  '@core/syntax/types/directives',
  '@core/syntax/types/variables',
  
  // Other significant imports
  '@core/syntax/types/factories',
  '@core/syntax/types/legacy',
  '@core/types-old'
  
  // NOTE: @core/types is the canonical location for non-AST types, so we don't flag it
];

// Important node types to look for specifically
const SPECIFIC_NODE_TYPES = [
  'MeldNode',
  'DirectiveNode',
  'TextNode',
  'CodeFenceNode',
  'VariableReferenceNode',
  'SourceLocation',
  'InterpolatableValue',
  'DirectiveKind',
  'DirectiveSubtype'
];

// Define directories to search in
const SEARCH_DIRS = [
  'core',
  'services',
  'tests',
  'cli',
  'api'
];

// Files to exclude (if any)
const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
];

// Find files containing the given pattern
function findFilesWithPattern(pattern) {
  try {
    // Use ripgrep for efficient searching
    const excludeArgs = EXCLUDE_PATTERNS.map(p => `--glob=!${p}`).join(' ');
    const command = `rg -l "${pattern}" ${SEARCH_DIRS.join(' ')} --type ts ${excludeArgs}`;
    
    if (process.env.DEBUG) {
      console.log(`Running command: ${command}`);
    }
    
    const output = execSync(command, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Handle case where rg doesn't find any matches (exits with error)
    if (error.status === 1 && (error.stdout === '' || !error.stdout)) {
      return [];
    }
    
    // If rg is not installed, fall back to find + grep
    try {
      console.log('Falling back to find + grep...');
      const dirs = SEARCH_DIRS.map(dir => `-path "./${dir}/*"`).join(' -o ');
      const excludes = EXCLUDE_PATTERNS.map(p => `-not -path "./${p}/*"`).join(' ');
      const command = `find . \\( ${dirs} \\) ${excludes} -name "*.ts" | xargs grep -l "${pattern}"`;
      
      if (process.env.DEBUG) {
        console.log(`Running fallback command: ${command}`);
      }
      
      const output = execSync(command, { encoding: 'utf-8' });
      return output.trim().split('\n').filter(Boolean);
    } catch (fallbackError) {
      if (fallbackError.status === 1 && fallbackError.stdout === '') {
        return [];
      }
      console.error('Error searching for files:', fallbackError.message);
      return [];
    }
  }
}

// Add a more targeted search function that looks at actual import statements
function findSpecificImports(pattern) {
  try {
    // Use ripgrep with specific import pattern matching
    const regex = `import\\s+(?:type\\s+)?(?:\\{[^\\}]*?${pattern}[^\\}]*?\\})\\s+from\\s+['"][^'"]*['"]`;
    const command = `rg -l "${regex}" ${SEARCH_DIRS.join(' ')} --type ts --pcre2`;
    
    if (process.env.DEBUG) {
      console.log(`Running specific import command: ${command}`);
    }
    
    const output = execSync(command, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Handle case where rg doesn't find any matches (exits with error)
    if (error.status === 1 && (error.stdout === '' || !error.stdout)) {
      return [];
    }
    
    console.error('Error searching for specific imports:', error.message);
    return [];
  }
}

// Function to find files using old node.directive.* access patterns
function findOldNodeAccessPatterns() {
  try {
    // Look for node.directive.* patterns which should be changed to node.*
    const command = `rg -l "node\\.directive\\." ${SEARCH_DIRS.join(' ')} --type ts`;
    
    if (process.env.DEBUG) {
      console.log(`Running node.directive pattern search: ${command}`);
    }
    
    const output = execSync(command, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Handle case where rg doesn't find any matches
    if (error.status === 1 && (error.stdout === '' || !error.stdout)) {
      return [];
    }
    
    console.error('Error searching for node.directive patterns:', error.message);
    return [];
  }
}

// Group files by directory for better analysis
function groupFilesByDirectory(files) {
  const grouped = {};
  
  files.forEach(file => {
    const dir = path.dirname(file);
    if (!grouped[dir]) {
      grouped[dir] = [];
    }
    grouped[dir].push(path.basename(file));
  });
  
  return grouped;
}

// Main function
function main() {
  // Handle command line arguments
  const args = process.argv.slice(2);
  const specificsOnly = args.includes('--specifics-only');
  const includeSpecifics = args.includes('--include-specifics') || !specificsOnly;
  const debug = args.includes('--debug');
  
  if (debug) {
    process.env.DEBUG = 'true';
  }
  
  if (args.includes('--help')) {
    console.log(`
Usage: node find-old-type-imports.cjs [options]

Options:
  --specifics-only       Only search for specific node type imports (like MeldNode)
  --include-specifics    Include specific node type imports in addition to pattern search
  --debug                Show debug information, including search commands
  --help                 Show this help message

Examples:
  node find-old-type-imports.cjs                  # Standard search
  node find-old-type-imports.cjs --include-specifics  # Also search for specific types
  node find-old-type-imports.cjs --specifics-only     # Only search for specific types
`);
    return;
  }
  
  console.log('Searching for files with old type imports...');
  
  const results = {};
  const specificResults = {};
  const nodeAccessResults = [];
  const uniqueFiles = new Set();
  
  // Search for each pattern
  if (includeSpecifics && !specificsOnly) {
    console.log('Searching for general import patterns...');
    for (const pattern of OLD_TYPE_PATTERNS) {
      const files = findFilesWithPattern(pattern);
      if (files.length > 0) {
        results[pattern] = files;
        files.forEach(file => uniqueFiles.add(file));
      }
    }
  }
  
  // Search for specific node types
  if (includeSpecifics || specificsOnly) {
    console.log('Searching for specific node type imports...');
    for (const nodeType of SPECIFIC_NODE_TYPES) {
      const files = findSpecificImports(nodeType);
      if (files.length > 0) {
        specificResults[nodeType] = files;
        files.forEach(file => uniqueFiles.add(file));
      }
    }
  }
  
  // Search for node.directive.* access patterns
  console.log('Searching for old node.directive.* access patterns...');
  const nodeDirectiveFiles = findOldNodeAccessPatterns();
  if (nodeDirectiveFiles.length > 0) {
    nodeAccessResults.push(...nodeDirectiveFiles);
    nodeDirectiveFiles.forEach(file => uniqueFiles.add(file));
  }

  // Display results
  console.log('\nResults:');
  let totalPatternMatches = 0;
  let totalSpecificMatches = 0;
  
  const hasResults = Object.keys(results).length > 0;
  const hasSpecificResults = Object.keys(specificResults).length > 0;
  
  if (!hasResults && !hasSpecificResults) {
    console.log('No files found with old type imports!');
    return;
  }
  
  // Display results by pattern
  if (hasResults) {
    console.log('\n=== RESULTS BY IMPORT PATTERN ===');
    for (const [pattern, files] of Object.entries(results)) {
      console.log(`\nPattern: ${pattern}`);
      console.log('-'.repeat(pattern.length + 9));
      files.forEach(file => console.log(`- ${file}`));
      totalPatternMatches += files.length;
    }
  }
  
  // Display specific node type import results
  if (hasSpecificResults) {
    console.log('\n=== SPECIFIC NODE TYPE IMPORTS ===');
    for (const [nodeType, files] of Object.entries(specificResults)) {
      console.log(`\nNode Type: ${nodeType}`);
      console.log('-'.repeat(nodeType.length + 11));
      files.forEach(file => console.log(`- ${file}`));
      totalSpecificMatches += files.length;
    }
  }
  
  // Display node.directive.* access pattern results
  if (nodeAccessResults.length > 0) {
    console.log('\n=== OLD NODE.DIRECTIVE.* ACCESS PATTERNS ===');
    console.log('These files use node.directive.* which should be updated to node.*');
    console.log('-'.repeat(70));
    nodeAccessResults.forEach(file => console.log(`- ${file}`));
  }
  
  // Display results by directory
  console.log('\n\n=== RESULTS BY DIRECTORY ===');
  const allFiles = Array.from(uniqueFiles);
  const groupedByDir = groupFilesByDirectory(allFiles);
  
  for (const [dir, files] of Object.entries(groupedByDir)) {
    console.log(`\nDirectory: ${dir}`);
    console.log('-'.repeat(dir.length + 11));
    files.forEach(file => console.log(`- ${path.join(dir, file)}`));
  }
  
  // Category summaries
  console.log('\n\n=== SUMMARY ===');
  console.log(`Total unique files with old imports: ${uniqueFiles.size}`);
  if (hasResults) {
    console.log(`Total pattern matches found: ${totalPatternMatches}`);
  }
  if (hasSpecificResults) {
    console.log(`Total specific node type imports found: ${totalSpecificMatches}`);
  }
  if (nodeAccessResults.length > 0) {
    console.log(`Total files with node.directive.* patterns: ${nodeAccessResults.length}`);
  }
  
  // File types categorization
  const fileTypes = {
    'handler': 0,
    'service': 0,
    'test': 0,
    'util': 0,
    'core': 0,
    'other': 0
  };
  
  allFiles.forEach(file => {
    if (file.includes('Handler')) fileTypes.handler++;
    else if (file.includes('Service')) fileTypes.service++;
    else if (file.includes('.test.')) fileTypes.test++;
    else if (file.includes('util') || file.includes('Utils')) fileTypes.util++;
    else if (file.startsWith('core/')) fileTypes.core++;
    else fileTypes.other++;
  });
  
  console.log('\nFile categories:');
  Object.entries(fileTypes).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`- ${type}: ${count} files`);
    }
  });
  
  console.log('\nNext steps:');
  console.log('1. Update imports in tests first (they are typically safest)');
  console.log('2. Update imports in utility functions');
  console.log('3. Update service implementations');
  console.log('4. Run tests after each batch of changes');
  
  // Check for important validation files
  const validationFiles = allFiles.filter(file => 
    file.includes('ValidationService') || 
    file.includes('Validator') ||
    file.includes('FuzzyMatching')
  );
  
  if (validationFiles.length > 0) {
    console.log('\nPriority files (ValidationService):');
    validationFiles.forEach(file => console.log(`- ${file}`));
  }
  
  // Generate migration guidance
  console.log('\n=== MIGRATION GUIDANCE ===');
  console.log('Common type imports to update:');
  console.log('- @core/syntax/types → @core/ast/types');
  console.log('- @core/syntax/types/nodes → @core/ast/types/nodes');
  console.log('- @core/syntax/types/directives → @core/ast/types/directives');
  console.log('- @core/syntax/types/variables → @core/ast/types/variables');
  console.log('\nSpecific types to check:');
  console.log('- MeldNode - Core type that should use the discriminated union from @core/ast/types');
  console.log('- DirectiveNode - Node type that should use @core/ast/types version');
  console.log('- Look for node.directive.* access patterns which should be changed to node.*');
}

main();
