#!/usr/bin/env node

/**
 * Script to check for lingering module import issues in the codebase
 * 
 * This script scans all TypeScript files and identifies:
 * 1. Internal imports without .js extensions
 * 2. Node.js built-in modules with .js extensions
 * 3. @sdk imports that should be @api
 * 4. Implicit directory imports without index.js
 * 
 * Usage:
 *   node scripts/check-module-imports.js [path1 path2 ...]
 * 
 * Options:
 *   path1, path2, ...  Specific paths to check (default: all TS files)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const PATHS = process.argv
  .filter(arg => !arg.includes('check-module-imports.js'))
  .filter(Boolean);

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Node.js built-in modules list
const NODE_BUILTINS = [
  'fs', 'path', 'events', 'crypto', 'readline', 'os', 'util', 'stream', 'zlib', 
  'http', 'https', 'child_process', 'buffer', 'url', 'querystring', 'assert',
];

// Get all TypeScript files to check
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

// Check imports in a file
function checkImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  // Regular expression for import statements
  const importRegex = /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  
  // Find all imports in the file
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Check for Node.js built-in modules with .js extension
    if (NODE_BUILTINS.includes(importPath.replace(/\.js$/, '')) && importPath.endsWith('.js')) {
      issues.push({
        type: 'node-builtin-with-js',
        importPath,
        line: content.substring(0, match.index).split('\n').length,
      });
      continue;
    }
    
    // Skip external node modules
    if (!importPath.startsWith('.') && !importPath.startsWith('@')) {
      continue;
    }
    
    // Check for internal imports without .js extension
    if (!importPath.endsWith('.js') && 
        !importPath.endsWith('.json') && 
        !importPath.endsWith('.css') && 
        !importPath.endsWith('.scss') && 
        !importPath.endsWith('.html') && 
        !importPath.endsWith('.svg') && 
        !importPath.endsWith('.png') && 
        !importPath.endsWith('.jpg') && 
        !importPath.endsWith('.jpeg') && 
        !importPath.endsWith('.gif')) {
      issues.push({
        type: 'missing-js-extension',
        importPath,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
    
    // Check for @sdk imports that should be @api
    if (importPath.startsWith('@sdk/')) {
      issues.push({
        type: 'sdk-to-api',
        importPath,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
    
    // Check for directory imports without index.js
    if ((importPath.startsWith('.') || importPath.startsWith('@')) && 
        !importPath.includes('.') && 
        !importPath.endsWith('/')) {
      issues.push({
        type: 'directory-without-index',
        importPath,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
  }
  
  return { filePath, issues };
}

// Format issues for display
function formatIssues(fileResults) {
  const totalIssues = fileResults.reduce((acc, { issues }) => acc + issues.length, 0);
  const fileCount = fileResults.filter(({ issues }) => issues.length > 0).length;
  
  console.log(`\nFound ${totalIssues} issues in ${fileCount} files\n`);
  
  if (totalIssues === 0) {
    console.log('All module imports conform to standards! ✅');
    return;
  }
  
  // Group by issue type
  const issueTypes = {
    'missing-js-extension': 'Internal imports missing .js extension',
    'node-builtin-with-js': 'Node.js built-in modules with .js extension',
    'sdk-to-api': '@sdk imports that should be @api',
    'directory-without-index': 'Directory imports without index.js',
  };
  
  for (const [type, description] of Object.entries(issueTypes)) {
    const typeIssues = fileResults
      .flatMap(({ filePath, issues }) => 
        issues
          .filter(issue => issue.type === type)
          .map(issue => ({ filePath, issue }))
      );
    
    if (typeIssues.length > 0) {
      console.log(`\n${description} (${typeIssues.length}):`);
      
      for (const { filePath, issue } of typeIssues) {
        const relativePath = path.relative(PROJECT_ROOT, filePath);
        console.log(`  ${relativePath}:${issue.line} - ${issue.importPath}`);
      }
    }
  }
  
  console.log('\nRun npm run fix:imports to fix these issues automatically.');
}

// Main function
function main() {
  console.log('Checking module import standards...');
  
  const files = getTypeScriptFiles();
  console.log(`Scanning ${files.length} TypeScript files`);
  
  const results = [];
  
  for (const file of files) {
    try {
      const result = checkImports(file);
      if (result.issues.length > 0) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  formatIssues(results);
  
  // Return exit code for CI integration
  process.exit(results.length > 0 ? 1 : 0);
}

main();