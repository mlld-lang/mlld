#!/usr/bin/env node
/**
 * Granular incremental build system
 *
 * Only rebuilds the parts that changed:
 * - Grammar: Only if .peggy or grammar/*.ts changed
 * - TypeScript: Only if source .ts files changed
 * - Errors: Only if error templates changed
 * - Version: Only if package.json changed
 * - Fixtures: Only if test cases changed
 *
 * This is MUCH faster than rebuilding everything!
 */

import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { glob } from 'glob';

// ANSI color codes
const yellow = '\x1b[33m';
const green = '\x1b[32m';
const blue = '\x1b[34m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';

// Track what needs rebuilding
const needsRebuild = {
  version: false,
  errors: false,
  grammar: false,
  fixtures: false,
  typescript: false,
  python: false,
  wasm: false,
  mlldx: false
};

let totalSteps = 0;
let completedSteps = 0;

/**
 * Get list of changed files from git
 */
function getChangedFiles() {
  try {
    const changedFiles = new Set();

    // Staged changes
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      staged.forEach(f => changedFiles.add(f));
    } catch {}

    // Unstaged changes
    try {
      const unstaged = execSync('git diff --name-only', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      unstaged.forEach(f => changedFiles.add(f));
    } catch {}

    // Untracked files
    try {
      const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      untracked.forEach(f => changedFiles.add(f));
    } catch {}

    return Array.from(changedFiles);
  } catch {
    // If git fails, return empty (we'll check timestamps instead)
    return [];
  }
}

/**
 * Check if output file is older than any input files
 */
function isOutputStale(outputFile, inputFiles) {
  if (!existsSync(outputFile)) return true;

  const outputTime = statSync(outputFile).mtimeMs;

  for (const inputFile of inputFiles) {
    if (existsSync(inputFile)) {
      const inputTime = statSync(inputFile).mtimeMs;
      if (inputTime > outputTime) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if version needs rebuilding
 */
function checkVersion(changedFiles) {
  const versionOutput = 'core/version.ts';
  const versionInput = 'package.json';

  // Check git changes
  if (changedFiles.includes(versionInput)) {
    console.log(`${cyan}  Version:${reset} package.json changed`);
    return true;
  }

  // Check timestamps
  if (isOutputStale(versionOutput, [versionInput])) {
    console.log(`${cyan}  Version:${reset} ${versionOutput} is stale`);
    return true;
  }

  return false;
}

/**
 * Check if error patterns need rebuilding
 */
function checkErrors(changedFiles) {
  const errorOutputs = [
    'core/errors/patterns/parse-errors.generated.js',
    'core/errors/patterns/js-errors.generated.js'
  ];

  const errorInputs = [
    'scripts/build-parse-errors.js',
    'scripts/build-js-errors.js'
  ];

  // Check git changes
  for (const input of errorInputs) {
    if (changedFiles.includes(input)) {
      console.log(`${cyan}  Errors:${reset} ${input} changed`);
      return true;
    }
  }

  // Check timestamps
  for (const output of errorOutputs) {
    if (isOutputStale(output, errorInputs)) {
      console.log(`${cyan}  Errors:${reset} ${output} is stale`);
      return true;
    }
  }

  return false;
}

/**
 * Check if grammar needs rebuilding
 */
function checkGrammar(changedFiles) {
  const grammarOutputs = [
    'grammar/generated/parser/parser.js',
    'grammar/generated/parser/parser.cjs',
    'grammar/generated/parser/parser.ts'
  ];

  const grammarInputs = [
    'grammar/mlld.peggy',
    'grammar/deps/grammar-core.ts',
    'grammar/parser/index.ts',
    'grammar/build-grammar.mjs'
  ];

  // Check if outputs exist
  for (const output of grammarOutputs) {
    if (!existsSync(output)) {
      console.log(`${cyan}  Grammar:${reset} ${output} missing`);
      return true;
    }
  }

  // Check git changes for grammar files
  for (const file of changedFiles) {
    if (file.match(/^grammar\/.*\.(peggy|ts|mjs)$/) && !file.includes('test')) {
      console.log(`${cyan}  Grammar:${reset} ${file} changed`);
      return true;
    }
  }

  // Check timestamps
  for (const output of grammarOutputs) {
    if (isOutputStale(output, grammarInputs)) {
      console.log(`${cyan}  Grammar:${reset} ${output} is stale`);
      return true;
    }
  }

  return false;
}

/**
 * Check if TypeScript needs rebuilding
 */
function checkTypeScript(changedFiles) {
  const tsOutputs = [
    'dist/index.mjs',
    'dist/index.cjs',
    'dist/cli.cjs'
  ];

  // Check if outputs exist
  for (const output of tsOutputs) {
    if (!existsSync(output)) {
      console.log(`${cyan}  TypeScript:${reset} ${output} missing`);
      return true;
    }
  }

  // Check git changes for source TypeScript files (not tests)
  for (const file of changedFiles) {
    if (file.match(/\.(ts|tsx)$/) && !file.includes('.test.') && !file.includes('tests/')) {
      // Skip grammar files (handled separately)
      if (file.startsWith('grammar/')) continue;

      console.log(`${cyan}  TypeScript:${reset} ${file} changed`);
      return true;
    }
  }

  // Check if dist is stale (older than 24 hours)
  const distTime = statSync(tsOutputs[0]).mtimeMs;
  const ageInHours = (Date.now() - distTime) / (1000 * 60 * 60);
  if (ageInHours > 24) {
    console.log(`${cyan}  TypeScript:${reset} dist is ${Math.floor(ageInHours)} hours old`);
    return true;
  }

  return false;
}

/**
 * Check if fixtures need rebuilding
 */
function checkFixtures(changedFiles) {
  // Fixtures are only needed for development, can skip in most cases
  // Only rebuild if test case .md files changed

  for (const file of changedFiles) {
    if (file.match(/^tests\/cases\/.*\.md$/)) {
      console.log(`${cyan}  Fixtures:${reset} ${file} changed`);
      return true;
    }
  }

  return false;
}

/**
 * Execute a build step
 */
function runBuildStep(name, command) {
  completedSteps++;
  console.log(`${blue}[${completedSteps}/${totalSteps}]${reset} Building ${name}...`);

  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`${green}✓${reset} ${name} complete\n`);
  } catch (error) {
    console.error(`${yellow}✗${reset} ${name} failed\n`);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`${blue}🔍 Checking what needs rebuilding...${reset}\n`);

  // Force build if requested
  if (process.env.FORCE_BUILD === '1') {
    console.log(`${yellow}🔨 FORCE_BUILD=1 - rebuilding everything${reset}\n`);
    needsRebuild.version = true;
    needsRebuild.errors = true;
    needsRebuild.grammar = true;
    needsRebuild.typescript = true;
    needsRebuild.python = true;
    needsRebuild.wasm = true;
    needsRebuild.mlldx = true;
  } else {
    // Get changed files
    const changedFiles = getChangedFiles();

    // Check each component
    needsRebuild.version = checkVersion(changedFiles);
    needsRebuild.errors = checkErrors(changedFiles);
    needsRebuild.grammar = checkGrammar(changedFiles);
    needsRebuild.typescript = checkTypeScript(changedFiles);
    needsRebuild.fixtures = checkFixtures(changedFiles);

    // Python, WASM, mlldx - only if relevant files changed
    needsRebuild.python = changedFiles.some(f =>
      f.includes('python') || f === 'package.json'
    );
    needsRebuild.wasm = false; // Usually skip WASM (optional step)
    needsRebuild.mlldx = changedFiles.some(f =>
      f === 'package.json' || (f.match(/\.(ts|js)$/) && !f.includes('.test.'))
    );
  }

  // Count steps
  totalSteps = Object.values(needsRebuild).filter(Boolean).length;

  // If nothing needs rebuilding
  if (totalSteps === 0) {
    console.log(`${green}✅ Everything up to date, nothing to rebuild!${reset}\n`);
    return;
  }

  console.log(`${blue}📦 Rebuilding ${totalSteps} component(s)...${reset}\n`);

  // Execute build steps in order
  try {
    if (needsRebuild.version) {
      runBuildStep('version', 'npm run build:version');
    }

    if (needsRebuild.errors) {
      runBuildStep('error patterns', 'npm run build:errors');
    }

    if (needsRebuild.grammar) {
      runBuildStep('grammar', 'npm run build:grammar:core');
    }

    if (needsRebuild.fixtures) {
      runBuildStep('fixtures', 'npm run build:grammar:fixtures');
    }

    if (needsRebuild.typescript) {
      runBuildStep('TypeScript', 'tsup');
    }

    if (needsRebuild.python) {
      runBuildStep('Python wrapper', 'npm run build:python');
    }

    if (needsRebuild.wasm) {
      runBuildStep('WASM files', 'npm run build:wasm');
    }

    if (needsRebuild.mlldx) {
      runBuildStep('mlldx sync', 'npm run sync:mlldx');
    }

    console.log(`${green}✅ Incremental build complete!${reset}`);
  } catch (error) {
    console.error(`${yellow}❌ Build failed${reset}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
