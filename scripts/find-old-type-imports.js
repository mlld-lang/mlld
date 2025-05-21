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
  '@core/types',
  '@core/syntax/types',
  './types-old',
  '../types-old',
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

function findFilesWithPattern(pattern) {
  try {
    // Use ripgrep for efficient searching
    const command = `rg -l "${pattern}" ${SEARCH_DIRS.join(' ')} --type ts`;
    const output = execSync(command, { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Handle case where rg doesn't find any matches (exits with error)
    if (error.status === 1 && error.stdout === '') {
      return [];
    }
    
    // If rg is not installed, fall back to find + grep
    try {
      console.log('Falling back to find + grep...');
      const dirs = SEARCH_DIRS.map(dir => `-path "./${dir}/*"`).join(' -o ');
      const command = `find . \\( ${dirs} \\) -name "*.ts" | xargs grep -l "${pattern}"`;
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

// Main function
function main() {
  console.log('Searching for files with old type imports...');
  
  const results = {};
  
  // Search for each pattern
  for (const pattern of OLD_TYPE_PATTERNS) {
    const files = findFilesWithPattern(pattern);
    if (files.length > 0) {
      results[pattern] = files;
    }
  }

  // Display results
  console.log('\nResults:');
  let totalFiles = 0;
  
  if (Object.keys(results).length === 0) {
    console.log('No files found with old type imports!');
  } else {
    for (const [pattern, files] of Object.entries(results)) {
      console.log(`\nPattern: ${pattern}`);
      console.log('-'.repeat(pattern.length + 9));
      files.forEach(file => console.log(`- ${file}`));
      totalFiles += files.length;
    }
    
    console.log(`\nTotal files to update: ${totalFiles}`);
    console.log('\nNext steps:');
    console.log('1. Update imports to use the new type structure');
    console.log('2. Run tests to ensure changes work correctly');
    console.log('3. Use "npm run fix-module-imports" if available to fix any import path issues');
  }
}

main();
