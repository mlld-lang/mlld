#!/usr/bin/env node

/**
 * Fix import paths in typescript files:
 * 1. Add .js extensions to imports
 * 2. Replace relative paths with path aliases where possible
 * 3. Ensure consistent formatting
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Set of modules that shouldn't have .js extension
const NATIVE_MODULES = new Set([
  'vitest',
  'fs-extra',
  'fs/promises',
  'fs',
  'path',
  'child_process',
  'util',
  'os',
  'meld-spec',
  'vitest-mock-extended',
  'tsyringe'
]);

// Path aliases from tsconfig.json
const PATH_ALIASES = {
  '@core': './core',
  '@services': './services',
  '@tests': './tests',
  '@api': './api'
};

// Regular expressions for matching import statements
const IMPORT_REGEX = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
const RELATIVE_PATH_REGEX = /^(?:\.\.\/)+(.+)$/;

/**
 * Check if the imported module needs a .js extension
 */
function needsJsExtension(importPath) {
  // Don't add .js to native modules or node_modules
  if (NATIVE_MODULES.has(importPath) || importPath.startsWith('node_modules/')) {
    return false;
  }
  
  // Don't add .js if it already has an extension
  if (path.extname(importPath) !== '') {
    return false;
  }
  
  return true;
}

/**
 * Convert a relative path to an aliased path if possible
 */
function convertToAliasPath(filePath, importPath) {
  // If already using an alias, return as is
  if (importPath.startsWith('@')) {
    return importPath;
  }
  
  // Only process relative paths
  const relativeMatch = importPath.match(RELATIVE_PATH_REGEX);
  if (!relativeMatch) {
    return importPath;
  }
  
  const importRelativePath = relativeMatch[1];
  const currentDir = path.dirname(filePath);
  const resolvedPath = path.resolve(currentDir, importPath);
  const projectRoot = process.cwd();
  
  // Check if this path matches any of our aliases
  for (const [alias, aliasPath] of Object.entries(PATH_ALIASES)) {
    const aliasFullPath = path.resolve(projectRoot, aliasPath.replace('./', ''));
    
    if (resolvedPath.startsWith(aliasFullPath)) {
      // Convert to aliased path
      const relativePath = path.relative(aliasFullPath, resolvedPath);
      return `${alias}/${relativePath}`;
    }
  }
  
  return importPath;
}

/**
 * Fix import paths in a file
 */
async function fixImportsInFile(filePath) {
  let modified = false;
  
  // Read file content
  const content = await fs.readFile(filePath, 'utf8');
  
  // Process imports
  const newContent = content.replace(IMPORT_REGEX, (match, importPath) => {
    // Skip package.json imports
    if (importPath === './package.json') {
      return match;
    }
    
    // 1. Try to convert to alias path
    const aliasPath = convertToAliasPath(filePath, importPath);
    
    // 2. Add .js extension if needed
    let fixedPath = aliasPath;
    if (needsJsExtension(aliasPath)) {
      fixedPath = `${aliasPath}.js`;
    }
    
    // If path was modified, mark the file as changed
    if (fixedPath !== importPath) {
      modified = true;
      return match.replace(importPath, fixedPath);
    }
    
    return match;
  });
  
  // Write the changes back if modified
  if (modified) {
    await fs.writeFile(filePath, newContent, 'utf8');
    console.log(`✅ Fixed imports in: ${filePath}`);
    return true;
  }
  
  return false;
}

/**
 * Main function
 */
async function main() {
  try {
    // Get all TypeScript files
    const files = execSync('find . -type f -name "*.ts" -not -path "./node_modules/*" -not -path "./dist/*"', { encoding: 'utf8' })
      .trim()
      .split('\n');
    
    // Filter only test files initially since that's our focus
    const testFiles = files.filter(file => file.includes('.test.ts'));
    
    let fixedCount = 0;
    
    // Process test files
    for (const file of testFiles) {
      try {
        const wasFixed = await fixImportsInFile(file);
        if (wasFixed) fixedCount++;
      } catch (error) {
        console.error(`❌ Error processing file ${file}:`, error.message);
      }
    }
    
    console.log(`Fixed imports in ${fixedCount} test files.`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 