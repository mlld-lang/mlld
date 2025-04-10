#!/usr/bin/env node

/**
 * Fix common test pattern issues:
 * 1. Replace resolveSync with await resolve()
 * 2. Add null checks to context cleanup
 * 3. Ensure await is used with container.resolve()
 * 4. Replace jest-mock-deep with vitest-mock-extended
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Regular expressions for matching patterns
const RESOLVE_SYNC_REGEX = /context\.resolveSync\s*<([^>]*)>\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RESOLVE_SYNC_CLASS_REGEX = /context\.resolveSync\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;
const CONTAINER_RESOLVE_REGEX = /(?<!await\s+)context\.[^.]*container\.resolve\s*<([^>]*)>\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CONTAINER_RESOLVE_CLASS_REGEX = /(?<!await\s+)context\.[^.]*container\.resolve\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;
const CONTEXT_CLEANUP_REGEX = /await\s+context\.cleanup\(\)/g;
const JEST_MOCK_DEEP_REGEX = /from\s+['"]jest-mock-deep['"]/g;

/**
 * Fix resolve patterns in a file
 */
async function fixResolvePatterns(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  let modified = false;

  // 1. Replace context.resolveSync<T>('Token') with await context.resolve<T>('Token')
  const updatedContent1 = content.replace(RESOLVE_SYNC_REGEX, (match, type, token) => {
    modified = true;
    return `await context.resolve<${type}>('${token}')`;
  });

  // 2. Replace context.resolveSync(Class) with await context.resolve(Class)
  const updatedContent2 = updatedContent1.replace(RESOLVE_SYNC_CLASS_REGEX, (match, className) => {
    modified = true;
    return `await context.resolve(${className})`;
  });

  // 3. Add await to container.resolve<T>('Token') if missing
  const updatedContent3 = updatedContent2.replace(CONTAINER_RESOLVE_REGEX, (match, type, token) => {
    modified = true;
    return `await context.container.resolve<${type}>('${token}')`;
  });

  // 4. Add await to container.resolve(Class) if missing
  const updatedContent4 = updatedContent3.replace(CONTAINER_RESOLVE_CLASS_REGEX, (match, className) => {
    modified = true;
    return `await context.container.resolve(${className})`;
  });

  // 5. Add null check to context.cleanup()
  const updatedContent5 = updatedContent4.replace(CONTEXT_CLEANUP_REGEX, 'await context?.cleanup()');

  // 6. Replace jest-mock-deep with vitest-mock-extended
  const updatedContent6 = updatedContent5.replace(JEST_MOCK_DEEP_REGEX, (match) => {
    modified = true;
    return `from 'vitest-mock-extended'`;
  });

  // Check for any changes
  if (content !== updatedContent6) {
    await fs.writeFile(filePath, updatedContent6, 'utf8');
    console.log(`✅ Fixed resolve patterns in: ${filePath}`);
    return true;
  }

  return false;
}

/**
 * Check if the file needs beforeEach updated from sync to async
 */
async function fixBeforeEachPatterns(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  
  // If we added await to any resolve methods, we need to ensure beforeEach is async
  if (content.includes('await context.resolve') || content.includes('await context.container.resolve')) {
    const syncBeforeEachRegex = /beforeEach\(\s*\(\s*\)\s*=>\s*\{/g;
    if (syncBeforeEachRegex.test(content)) {
      const updatedContent = content.replace(syncBeforeEachRegex, 'beforeEach(async () => {');
      
      if (content !== updatedContent) {
        await fs.writeFile(filePath, updatedContent, 'utf8');
        console.log(`✅ Fixed beforeEach in: ${filePath}`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Main function
 */
async function main() {
  try {
    // Get all TypeScript test files
    const files = execSync('find . -type f -name "*.test.ts" -not -path "./node_modules/*" -not -path "./dist/*"', { encoding: 'utf8' })
      .trim()
      .split('\n');
    
    let resolveFixCount = 0;
    let beforeEachFixCount = 0;
    let mockLibFixCount = 0;
    
    // Process files
    for (const file of files) {
      try {
        const resolveFixed = await fixResolvePatterns(file);
        if (resolveFixed) {
          resolveFixCount++;
          
          // If fixed jest-mock-deep
          if (await fs.readFile(file, 'utf8').then(content => !content.includes('jest-mock-deep'))) {
            mockLibFixCount++;
          }
        }
        
        const beforeEachFixed = await fixBeforeEachPatterns(file);
        if (beforeEachFixed) beforeEachFixCount++;
      } catch (error) {
        console.error(`❌ Error processing file ${file}:`, error.message);
      }
    }
    
    console.log(`\nSummary:`);
    console.log(`- Fixed resolve patterns in ${resolveFixCount} files`);
    console.log(`- Fixed beforeEach in ${beforeEachFixCount} files`);
    console.log(`- Fixed mock library references in ${mockLibFixCount} files`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 