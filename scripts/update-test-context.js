#!/usr/bin/env node

/**
 * This script updates tests to use TestContextDI.create() instead of the deprecated
 * TestContextDI.withDI() and TestContextDI.withoutDI() methods.
 * 
 * Usage:
 *   node scripts/update-test-context.js [file or directory path]
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Regular expressions for finding deprecated test context initialization
const withDIRegex = /TestContextDI\.withDI\(\)/g;
const withoutDIRegex = /TestContextDI\.withoutDI\(\)/g;

// Replacement pattern
const createReplacement = 'TestContextDI.create({ isolatedContainer: true })';

function processFile(filePath) {
  console.log(`Processing ${filePath}...`);
  
  // Read the file content
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Replace deprecated method calls
  if (withDIRegex.test(content)) {
    content = content.replace(withDIRegex, createReplacement);
    modified = true;
    console.log(`  - Replaced TestContextDI.withDI() in ${filePath}`);
  }
  
  if (withoutDIRegex.test(content)) {
    content = content.replace(withoutDIRegex, createReplacement);
    modified = true;
    console.log(`  - Replaced TestContextDI.withoutDI() in ${filePath}`);
  }
  
  // Only write back if changes were made
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  - Updated ${filePath}`);
  } else {
    console.log(`  - No changes needed in ${filePath}`);
  }
}

function processDirectory(dirPath) {
  // Find all TypeScript test files in the directory
  const files = glob.sync(`${dirPath}/**/*.test.ts`);
  console.log(`Found ${files.length} test files in ${dirPath}`);
  
  files.forEach(file => {
    processFile(file);
  });
}

// Main execution
function main() {
  const targetPath = process.argv[2] || '.';
  const fullPath = path.resolve(process.cwd(), targetPath);
  
  console.log(`Starting test context update for: ${fullPath}`);
  
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (stat.isFile()) {
      processFile(fullPath);
    } else {
      console.error(`Error: ${fullPath} is neither a file nor a directory`);
      process.exit(1);
    }
  } else {
    console.error(`Error: ${fullPath} does not exist`);
    process.exit(1);
  }
  
  console.log('Update complete!');
}

main(); 