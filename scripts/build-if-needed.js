#!/usr/bin/env node
/**
 * Smart build checker that only rebuilds when necessary
 *
 * Checks:
 * 1. Critical output files exist
 * 2. Git working tree for relevant changes
 * 3. Package.json or config file changes
 *
 * Can be overridden with FORCE_BUILD=1 environment variable
 *
 * This significantly speeds up test-edit-test cycles by skipping
 * unnecessary rebuilds when only test files changed.
 */

import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';

// ANSI color codes
const yellow = '\x1b[33m';
const green = '\x1b[32m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

// Critical output files that must exist
const CRITICAL_FILES = [
  'dist/index.mjs',
  'dist/cli.cjs',
  'grammar/generated/parser/parser.js',
  'grammar/generated/parser/parser.cjs',
  'grammar/generated/parser/parser.ts'
];

// Config files that always trigger rebuild
const CONFIG_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsup.config.ts',
  'vitest.config.mts'
];

/**
 * Check if all critical output files exist
 */
function criticalFilesExist() {
  const missing = CRITICAL_FILES.filter(file => !existsSync(file));

  if (missing.length > 0) {
    console.log(`${yellow}⚠️  Missing critical files:${reset}`);
    missing.forEach(file => console.log(`   - ${file}`));
    return false;
  }

  return true;
}

/**
 * Check if source code has changed since last commit
 * Returns true if rebuild needed, false otherwise
 */
function hasRelevantChanges() {
  try {
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch {
      console.log(`${blue}ℹ️  Not a git repository, rebuilding for safety${reset}`);
      return true;
    }

    // Get list of changed files (staged, unstaged, and untracked)
    const changedFiles = new Set();

    // Staged changes
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      staged.forEach(f => changedFiles.add(f));
    } catch {
      // Ignore errors
    }

    // Unstaged changes
    try {
      const unstaged = execSync('git diff --name-only', { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      unstaged.forEach(f => changedFiles.add(f));
    } catch {
      // Ignore errors
    }

    // Untracked files
    try {
      const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      untracked.forEach(f => changedFiles.add(f));
    } catch {
      // Ignore errors
    }

    // Filter for relevant changes
    const changed = Array.from(changedFiles);

    if (changed.length === 0) {
      return false; // No changes at all
    }

    // Check for config file changes (always trigger rebuild)
    const configChanges = changed.filter(f => CONFIG_FILES.includes(f));
    if (configChanges.length > 0) {
      console.log(`${yellow}⚠️  Config file changes detected:${reset}`);
      configChanges.forEach(f => console.log(`   - ${f}`));
      return true;
    }

    // Check for source code changes (not tests)
    const sourceChanges = changed.filter(f => {
      // Skip test files
      if (f.includes('.test.') || f.includes('.spec.')) return false;

      // Include source code
      if (f.match(/\.(ts|js|mjs|cjs|peggy)$/)) return true;

      // Include grammar files
      if (f.startsWith('grammar/')) return true;

      return false;
    });

    if (sourceChanges.length > 0) {
      console.log(`${yellow}⚠️  Source code changes detected:${reset}`);
      sourceChanges.forEach(f => console.log(`   - ${f}`));
      return true;
    }

    // Only test files or other non-source changes
    console.log(`${green}✓${reset} Only test/doc changes detected, build not needed`);
    return false;

  } catch (error) {
    // If git commands fail, rebuild for safety
    console.log(`${blue}ℹ️  Cannot detect changes (${error.message}), rebuilding for safety${reset}`);
    return true;
  }
}

/**
 * Check if dist files are older than a reasonable threshold
 * This helps detect stale builds even if git says no changes
 */
function distFilesAreFresh() {
  if (!existsSync('dist/index.mjs')) return false;

  const distTime = statSync('dist/index.mjs').mtimeMs;
  const ageInHours = (Date.now() - distTime) / (1000 * 60 * 60);

  // If dist is older than 24 hours, consider it stale
  if (ageInHours > 24) {
    console.log(`${yellow}⚠️  Build is ${Math.floor(ageInHours)} hours old, rebuilding${reset}`);
    return false;
  }

  return true;
}

/**
 * Main logic
 */
function shouldBuild() {
  // Check for force build flag
  if (process.env.FORCE_BUILD === '1') {
    console.log(`${yellow}🔨 FORCE_BUILD=1 detected${reset}`);
    return true;
  }

  // Check critical files exist
  if (!criticalFilesExist()) {
    return true;
  }

  // Check if dist is stale
  if (!distFilesAreFresh()) {
    return true;
  }

  // Check for relevant changes
  return hasRelevantChanges();
}

// Main execution
if (shouldBuild()) {
  console.log(`${blue}🔨 Running build...${reset}\n`);
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (error) {
    console.error(`${yellow}Build failed${reset}`);
    process.exit(error.status || 1);
  }
} else {
  console.log(`${green}✅ Build up to date, skipping rebuild${reset}\n`);
}
