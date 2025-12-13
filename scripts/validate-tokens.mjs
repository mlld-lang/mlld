#!/usr/bin/env node
/**
 * CLI script for validating semantic token coverage
 *
 * Usage:
 *   node scripts/validate-tokens.mjs
 *   node scripts/validate-tokens.mjs --mode=strict
 *   node scripts/validate-tokens.mjs feat/strict-mode
 *   node scripts/validate-tokens.mjs --verbose
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  mode: 'strict',
  pattern: null,
  verbose: false,
  showDiagnostics: false
};

for (const arg of args) {
  if (arg.startsWith('--mode=')) {
    options.mode = arg.split('=')[1];
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  } else if (arg === '--diagnostics' || arg === '-d') {
    options.showDiagnostics = true;
  } else if (arg.startsWith('--fixture=')) {
    options.pattern = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    options.pattern = arg;
  }
}

async function loadFixtures(pattern) {
  const fixturesDir = join(projectRoot, 'tests/fixtures');
  const fixtures = [];

  async function walkDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.name.endsWith('.generated-fixture.json')) {
        const content = await readFile(fullPath, 'utf-8');
        const fixture = JSON.parse(content);

        // Filter by mode
        if (options.mode === 'strict' && !isStrictMode(fixture)) {
          continue;
        }

        // Filter by pattern
        if (pattern && !fixture.name.includes(pattern)) {
          continue;
        }

        fixtures.push(fixture);
      }
    }
  }

  await walkDir(fixturesDir);
  return fixtures;
}

function isStrictMode(fixture) {
  if (fixture.mlldMode === 'strict') return true;
  if (fixture.name.includes('.mld') || fixture.name.includes('strict-mode')) return true;
  return false;
}

async function main() {
  console.log('Loading validator...\n');

  // Dynamic import to load TypeScript modules
  const validatorModule = await import('../tests/utils/token-validator/index.ts');
  const {
    TokenCoverageValidator,
    NodeExpectationBuilder,
    CoverageReporter,
    createNodeTokenRuleMap
  } = validatorModule;

  // Create validator
  const nodeTokenRules = createNodeTokenRuleMap();
  const expectationBuilder = new NodeExpectationBuilder(nodeTokenRules);
  const validator = new TokenCoverageValidator(expectationBuilder);
  const reporter = new CoverageReporter();

  // Load fixtures
  console.log(`Loading fixtures (mode: ${options.mode})...\n`);
  const fixtures = await loadFixtures(options.pattern);

  if (fixtures.length === 0) {
    console.log('No fixtures found matching criteria.');
    return;
  }

  console.log(`Validating ${fixtures.length} fixture${fixtures.length > 1 ? 's' : ''}...\n`);

  // Validate each fixture
  const results = [];
  let processed = 0;

  for (const fixture of fixtures) {
    try {
      const result = await validator.validateFixture(fixture);
      results.push(result);

      processed++;
      if (processed % 10 === 0) {
        process.stdout.write(`\rProcessed ${processed}/${fixtures.length}...`);
      }
    } catch (error) {
      console.error(`\nError validating ${fixture.name}:`, error.message || error);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
  }

  process.stdout.write(`\rProcessed ${processed}/${fixtures.length}   \n\n`);

  // Generate report
  const report = reporter.generateReport(results, {
    verbose: options.verbose,
    showDiagnostics: options.showDiagnostics
  });
  console.log(report);

  // Exit with error code if there are gaps
  const totalGaps = results.reduce((sum, r) => sum + r.gaps.length, 0);
  process.exit(totalGaps > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
