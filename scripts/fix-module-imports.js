#!/usr/bin/env node

/**
 * Script to fix import paths in the codebase to conform to the new module system
 * 
 * This script:
 * 1. Adds .js extensions to all internal imports
 * 2. Converts relative imports to path aliases when possible
 * 3. Separates type imports using 'import type'
 * 
 * Usage:
 *   node scripts/fix-module-imports.js [--dry-run] [--verbose] [path1 path2 ...]
 * 
 * Options:
 *   --dry-run  Don't modify files, just report what would be changed
 *   --verbose  Show detailed information about each change
 *   path1, path2, ...  Specific paths to process (default: all TS files)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const PATHS = process.argv
  .filter(arg => !arg.startsWith('--') && !arg.includes('fix-module-imports.js'))
  .filter(Boolean);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TSCONFIG_PATH = path.join(PROJECT_ROOT, 'tsconfig.json');

// Path alias mapping from tsconfig.json
const tsconfig = JSON.parse(fs.readFileSync(TSCONFIG_PATH, 'utf8'));
const PATH_ALIASES = Object.entries(tsconfig.compilerOptions.paths || {})
  .filter(([key]) => key.endsWith('/*'))
  .map(([key, value]) => ({
    alias: key.replace('/*', ''),
    path: value[0].replace('/*', '')
  }));

// External modules that don't need .js extension
const EXTERNAL_MODULES = [
  'tsyringe',
  'reflect-metadata',
  'vitest',
  'vitest-mock-extended',
  'child_process',
  'fs',
  'path',
  'util',
  'winston',
  'yargs',
  'memfs',
  'marked',
  'minimatch',
  'peggy',
  'llmxml',
  'glob',
  'commander',
  'chalk',
  'fs-extra',
  'uuid',
  'xmldom'
];

// Get all TypeScript files in the project
function getTypeScriptFiles() {
  if (PATHS.length > 0) {
    const files = [];
    for (const pathArg of PATHS) {
      const fullPath = path.resolve(process.cwd(), pathArg);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        const dirFiles = execSync(`find ${fullPath} -name "*.ts" -not -path "*node_modules*" -not -path "*dist*"`, { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(Boolean);
        files.push(...dirFiles);
      } else if (stats.isFile() && fullPath.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }
  
  return execSync(
    'find . -name "*.ts" -not -path "*node_modules*" -not -path "*dist*" -not -path "*build*"',
    { encoding: 'utf8', cwd: PROJECT_ROOT }
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(file => path.join(PROJECT_ROOT, file));
}

// Check if import is an external module
function isExternalModule(importPath) {
  return EXTERNAL_MODULES.some(m => 
    importPath === m || 
    importPath.startsWith(`${m}/`)
  );
}

// Convert relative path to alias path if possible
function convertToAliasPath(filePath, importPath) {
  if (importPath.startsWith('.')) {
    const fullImportPath = path.normalize(
      path.join(path.dirname(filePath), importPath)
    );
    
    const relativeToRoot = path.relative(PROJECT_ROOT, fullImportPath);
    
    for (const { alias, path: aliasPath } of PATH_ALIASES) {
      if (relativeToRoot.startsWith(aliasPath)) {
        return `${alias}/${relativeToRoot.slice(aliasPath.length)}`;
      }
    }
  }
  
  return importPath;
}

// Add .js extension to import path if needed
function addJsExtension(importPath) {
  if (isExternalModule(importPath)) {
    return importPath;
  }
  
  if (importPath.endsWith('.js')) {
    return importPath;
  }
  
  // Don't add .js to imports that already have an extension
  const extensions = ['.json', '.css', '.scss', '.html', '.svg', '.png', '.jpg', '.jpeg', '.gif'];
  if (extensions.some(ext => importPath.endsWith(ext))) {
    return importPath;
  }
  
  return `${importPath}.js`;
}

// Fix imports in a file
function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let hasChanges = false;
  
  // Regular expression for import statements
  // This handles: import, import type, import { ... }, import * as ...
  const importRegex = /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

  const updatedContent = content.replace(importRegex, (match, importPath) => {
    const isTypeImport = match.includes('import type');
    const originalPath = importPath;
    
    // Convert to alias path if possible
    const aliasPath = convertToAliasPath(filePath, importPath);
    
    // Add .js extension if needed
    const fixedPath = addJsExtension(aliasPath);
    
    if (originalPath !== fixedPath) {
      hasChanges = true;
      if (VERBOSE) {
        console.log(`${filePath}: ${originalPath} -> ${fixedPath}`);
      }
      
      // Replace the import path in the match
      return match.replace(originalPath, fixedPath);
    }
    
    return match;
  });
  
  if (hasChanges && !DRY_RUN) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`Updated ${filePath}`);
  } else if (hasChanges) {
    console.log(`Would update ${filePath} (dry run)`);
  }
  
  return hasChanges;
}

// Main function
function main() {
  console.log(`Starting import path fixes${DRY_RUN ? ' (dry run)' : ''}...`);
  
  const files = getTypeScriptFiles();
  console.log(`Found ${files.length} TypeScript files`);
  
  let changedFiles = 0;
  
  for (const file of files) {
    try {
      const changed = fixImports(file);
      if (changed) changedFiles++;
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\nSummary: ${changedFiles} files ${DRY_RUN ? 'would be ' : ''}updated`);
  
  if (DRY_RUN) {
    console.log('\nThis was a dry run. To apply changes, run without --dry-run');
  }
}

main();