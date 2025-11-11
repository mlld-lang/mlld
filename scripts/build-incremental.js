#!/usr/bin/env node
/**
 * Granular incremental build system
 *
 * Uses timestamp-based change detection (not git) to align with typical dev workflow:
 * edit → test → edit → test (without committing between runs)
 *
 * Tracks last build time in .last-build and only rebuilds components whose
 * source files changed since then. For performance, only checks files in git dirty
 * state (staged, unstaged, and untracked) rather than scanning all source files.
 *
 * Components checked:
 * - Grammar: Only if .peggy or grammar/*.ts changed
 * - TypeScript: Only if source .ts files changed
 * - Errors: Only if error templates changed
 * - Version: Only if package.json changed
 * - Fixtures: Only if test cases changed
 *
 * This is MUCH faster than rebuilding everything!
 */

import { existsSync, statSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { glob } from 'glob';
import { join } from 'path';

// Track last build time
const LAST_BUILD_FILE = '.last-build';

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
 * Get last build timestamp
 */
function getLastBuildTime() {
  try {
    if (existsSync(LAST_BUILD_FILE)) {
      const timestamp = readFileSync(LAST_BUILD_FILE, 'utf8').trim();
      return parseInt(timestamp, 10);
    }
  } catch {}
  return 0; // No previous build
}

/**
 * Update last build timestamp
 */
function updateLastBuildTime() {
  try {
    writeFileSync(LAST_BUILD_FILE, Date.now().toString());
  } catch (error) {
    // Not critical if this fails
    console.warn(`${yellow}Warning:${reset} Could not update build timestamp`);
  }
}

/**
 * Get list of dirty files from git (much faster than checking all files)
 */
function getDirtyFiles() {
  try {
    const dirtyFiles = new Set();

    // Staged changes
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      staged.forEach(f => dirtyFiles.add(f));
    } catch {}

    // Unstaged changes
    try {
      const unstaged = execSync('git diff --name-only', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      unstaged.forEach(f => dirtyFiles.add(f));
    } catch {}

    // Untracked files
    try {
      const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean);
      untracked.forEach(f => dirtyFiles.add(f));
    } catch {}

    return Array.from(dirtyFiles);
  } catch {
    // If git fails, return empty (we'll check all files as fallback)
    return [];
  }
}

/**
 * Check if any files in the list are newer than the last build
 * Only checks files that are in git dirty state for performance
 */
function hasFilesNewerThan(pattern, timestamp, dirtyFiles) {
  // Helper to match a file against pattern
  const matchesPattern = (file, pattern) => {
    if (typeof pattern === 'string') {
      return file === pattern;
    } else if (Array.isArray(pattern)) {
      return pattern.includes(file);
    } else if (pattern instanceof RegExp) {
      return pattern.test(file);
    } else if (typeof pattern === 'function') {
      return pattern(file);
    }
    return false;
  };

  // If we have dirty files, only check those that match our pattern
  if (dirtyFiles && dirtyFiles.length > 0) {
    const matchedDirtyFiles = dirtyFiles.filter(f => matchesPattern(f, pattern));

    for (const file of matchedDirtyFiles) {
      if (existsSync(file)) {
        const fileMtime = statSync(file).mtimeMs;
        if (fileMtime > timestamp) {
          return file;
        }
      }
    }
    return null;
  }

  // Fallback: check all files matching pattern (used when no dirty files or not a git repo)
  const filesToCheck = Array.isArray(pattern) ? pattern : glob.sync(pattern);
  for (const file of filesToCheck) {
    if (existsSync(file)) {
      const fileMtime = statSync(file).mtimeMs;
      if (fileMtime > timestamp) {
        return file;
      }
    }
  }
  return null;
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
function checkVersion(lastBuildTime, dirtyFiles) {
  const versionOutput = 'core/version.ts';
  const versionInput = 'package.json';

  // Check if output is missing
  if (!existsSync(versionOutput)) {
    console.log(`${cyan}  Version:${reset} ${versionOutput} missing`);
    return true;
  }

  // Check if input changed since last build
  const changedFile = hasFilesNewerThan([versionInput], lastBuildTime, dirtyFiles);
  if (changedFile) {
    console.log(`${cyan}  Version:${reset} ${changedFile} changed`);
    return true;
  }

  return false;
}

/**
 * Check if error patterns need rebuilding
 */
function checkErrors(lastBuildTime, dirtyFiles) {
  const errorOutputs = [
    'core/errors/patterns/parse-errors.generated.js',
    'core/errors/patterns/js-errors.generated.js'
  ];

  const errorInputs = [
    'scripts/build-parse-errors.js',
    'scripts/build-js-errors.js'
  ];

  // Check if outputs are missing
  for (const output of errorOutputs) {
    if (!existsSync(output)) {
      console.log(`${cyan}  Errors:${reset} ${output} missing`);
      return true;
    }
  }

  // Check if inputs changed since last build
  const changedFile = hasFilesNewerThan(errorInputs, lastBuildTime, dirtyFiles);
  if (changedFile) {
    console.log(`${cyan}  Errors:${reset} ${changedFile} changed`);
    return true;
  }

  return false;
}

/**
 * Check if grammar needs rebuilding
 */
function checkGrammar(lastBuildTime, dirtyFiles) {
  const grammarOutputs = [
    'grammar/generated/parser/parser.js',
    'grammar/generated/parser/parser.cjs',
    'grammar/generated/parser/parser.ts'
  ];

  // Check if outputs exist
  for (const output of grammarOutputs) {
    if (!existsSync(output)) {
      console.log(`${cyan}  Grammar:${reset} ${output} missing`);
      return true;
    }
  }

  // Check if any grammar source files changed
  const grammarPattern = (f) =>
    f.startsWith('grammar/') &&
    (f.endsWith('.peggy') || f.endsWith('.ts') || f.endsWith('.mjs')) &&
    !f.includes('.test.') &&
    !f.includes('/generated/');

  const changedFile = hasFilesNewerThan(grammarPattern, lastBuildTime, dirtyFiles);
  if (changedFile) {
    console.log(`${cyan}  Grammar:${reset} ${changedFile} changed`);
    return true;
  }

  return false;
}

/**
 * Check if TypeScript needs rebuilding
 */
function checkTypeScript(lastBuildTime, dirtyFiles) {
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

  // Check if any source TypeScript files changed (excluding tests and grammar)
  const tsPattern = (f) =>
    (f.startsWith('api/') || f.startsWith('cli/') || f.startsWith('core/') ||
     f.startsWith('interpreter/') || f.startsWith('output/') ||
     f.startsWith('security/') || f.startsWith('services/')) &&
    (f.endsWith('.ts') || f.endsWith('.tsx')) &&
    !f.includes('.test.') &&
    !f.includes('.spec.') &&
    !f.includes('/tests/');

  // Also check tsup config and tsconfig files
  const configFiles = ['tsup.config.ts', 'tsconfig.json', 'tsconfig.build.json'];

  // Combine pattern and config files
  const combinedPattern = (f) => tsPattern(f) || configFiles.includes(f);

  const changedFile = hasFilesNewerThan(combinedPattern, lastBuildTime, dirtyFiles);
  if (changedFile) {
    console.log(`${cyan}  TypeScript:${reset} ${changedFile} changed`);
    return true;
  }

  return false;
}

/**
 * Check if fixtures need rebuilding
 */
function checkFixtures(lastBuildTime, dirtyFiles) {
  // Fixtures are only needed for development, can skip in most cases
  // Only rebuild if test case .md files changed

  // Check if fixtures directory exists and has content
  const fixturesDir = 'tests/fixtures';
  if (!existsSync(fixturesDir)) {
    console.log(`${cyan}  Fixtures:${reset} ${fixturesDir} directory missing`);
    return true;
  }

  try {
    const fixtureFiles = glob.sync(`${fixturesDir}/**/*.generated-fixture.json`);
    if (fixtureFiles.length === 0) {
      console.log(`${cyan}  Fixtures:${reset} ${fixturesDir} is empty`);
      return true;
    }
  } catch {
    // If we can't check, force rebuild to be safe
    console.log(`${cyan}  Fixtures:${reset} cannot check fixture directory`);
    return true;
  }

  // Check if test case files changed
  const testCasePattern = (f) => f.startsWith('tests/cases/') && f.endsWith('.md');

  const changedFile = hasFilesNewerThan(testCasePattern, lastBuildTime, dirtyFiles);
  if (changedFile) {
    console.log(`${cyan}  Fixtures:${reset} ${changedFile} changed`);
    return true;
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
    // Silence tsup output to avoid noisy SWC warnings
    if (command.includes('tsup')) {
      execSync(command, { stdio: 'ignore' });
    } else {
      execSync(command, { stdio: 'inherit' });
    }
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
    // Get last build timestamp
    const lastBuildTime = getLastBuildTime();

    // Get dirty files (only check these for performance)
    const dirtyFiles = getDirtyFiles();

    // Check each component
    needsRebuild.version = checkVersion(lastBuildTime, dirtyFiles);
    needsRebuild.errors = checkErrors(lastBuildTime, dirtyFiles);
    needsRebuild.grammar = checkGrammar(lastBuildTime, dirtyFiles);
    needsRebuild.typescript = checkTypeScript(lastBuildTime, dirtyFiles);
    needsRebuild.fixtures = checkFixtures(lastBuildTime, dirtyFiles);

    // Python, WASM, mlldx - check their files too
    const pythonPattern = (f) => (f.startsWith('python/') && f.endsWith('.py')) || f === 'package.json';
    needsRebuild.python = hasFilesNewerThan(pythonPattern, lastBuildTime, dirtyFiles) !== null;

    needsRebuild.wasm = false; // Usually skip WASM (optional step)

    const mlldxFiles = ['package.json', 'mlldx-package/package.json'];
    needsRebuild.mlldx = hasFilesNewerThan(mlldxFiles, lastBuildTime, dirtyFiles) !== null;
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
      runBuildStep('TypeScript', 'npx tsup');
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

    // Update timestamp for next build comparison
    updateLastBuildTime();
  } catch (error) {
    console.error(`${yellow}❌ Build failed${reset}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
