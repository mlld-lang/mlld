#!/usr/bin/env node
/**
 * Smart test runner that checks .env.local for TESTFAST setting
 *
 * Behavior:
 * - If .env.local exists and TESTFAST=true, runs fast test suite
 * - Otherwise runs full comprehensive test suite
 * - Environment variable TESTFAST=true can override
 *
 * This allows developers to opt-in to fast tests locally while
 * keeping CI and default behavior comprehensive.
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=value
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }

  return env;
}

function shouldRunFastTests() {
  // Check environment variable first (allows override)
  if (process.env.TESTFAST === 'true' || process.env.TESTFAST === '1') {
    return true;
  }

  // Check .env.local file
  const localEnv = parseEnvFile('.env.local');
  if (localEnv.TESTFAST === 'true' || localEnv.TESTFAST === '1') {
    return true;
  }

  return false;
}

const testFast = shouldRunFastTests();

// Define test command based on mode
// Skips slowest integration/e2e tests but keeps moderate ones and slow fixture tests
// Skipped: imports/basic-patterns (8s), imports/edge-cases (6s), cli/absolute-paths (10s), heredoc e2e (6s)
// Kept: imports/shadow-environments (4s), imports/complex-scenarios (3.5s), cleanup tests (2.5s)
// Kept: feat/with/combined (4.5s), feat/with/needs-node (4s), slash/run/command-bases-npm-run (0.6s)
const command = testFast
  ? 'NODE_ENV=test MLLD_NO_STREAMING=true LOOSE_TESTMODE=${LOOSE_TESTMODE:-1} vitest run --reporter=dot --silent --exclude="**/integration/imports/basic-patterns.test.ts" --exclude="**/integration/imports/edge-cases.test.ts" --exclude="**/integration/cli/absolute-paths.test.ts" --exclude="**/integration/imports/local-resolver-bugs.test.ts" --exclude="**/integration/shadow-env-basic-import.test.ts" --exclude="**/integration/heredoc-large-variable.test.ts" --exclude="**/*.e2e.test.ts"'
  : 'NODE_ENV=test MLLD_NO_STREAMING=true LOOSE_TESTMODE=${LOOSE_TESTMODE:-1} vitest run --reporter=dot --silent';

// Show what we're doing
if (testFast) {
  console.log('⚡ Fast test mode enabled (TESTFAST=true)');
  console.log('   Skipping slowest tests: imports/basic-patterns, imports/edge-cases, cli/absolute-paths, heredoc e2e');
  console.log('   Run full suite with: TESTFAST=false npm test\n');
} else {
  console.log('🔍 Running full test suite');
  console.log('   Enable fast tests: add TESTFAST=true to .env.local\n');
}

try {
  execSync(command, { stdio: 'inherit', env: { ...process.env, LOOSE_TESTMODE: process.env.LOOSE_TESTMODE ?? '1' } });
} catch (error) {
  process.exit(error.status || 1);
}
