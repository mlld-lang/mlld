#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function findFixtures(basePath) {
  const fixtures = [];

  function walk(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && entry.name !== 'index.ts') {
          walk(fullPath);
        } else if (entry.name.endsWith('.generated-fixture.json')) {
          // Read the JSON to get the actual fixture name
          try {
            const content = JSON.parse(readFileSync(fullPath, 'utf8'));
            if (content.name) {
              fixtures.push(content.name);
            }
          } catch {
            // Skip files we can't parse
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  walk(basePath);
  return fixtures;
}

function getMatchingFixtures(pattern) {
  const fixturesDir = 'tests/fixtures';
  const allFixtures = findFixtures(fixturesDir);

  // Normalize pattern: remove trailing slash, forward slashes only
  const normalizedPattern = pattern.replace(/\/$/, '').replace(/\\/g, '/');

  // Exact match first
  const exact = allFixtures.filter(f => f === normalizedPattern);
  if (exact.length > 0) {
    return exact;
  }

  // Prefix match (with path boundary awareness)
  const prefixMatches = allFixtures.filter(f =>
    f.startsWith(normalizedPattern + '/') ||
    f.startsWith(normalizedPattern)
  );

  return prefixMatches;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run test:case -- <fixture-path>');
    console.error('');
    console.error('Examples:');
    console.error('  npm run test:case -- feat');
    console.error('  npm run test:case -- feat/alligator');
    console.error('  npm run test:case -- feat/alligator/glob-concat');
    console.error('');
    console.error('Supports partial paths:');
    console.error('  npm run test:case -- alligator  # All alligator tests');
    process.exit(1);
  }

  const pattern = args[0];
  const matching = getMatchingFixtures(pattern);

  if (matching.length === 0) {
    console.error(`No fixtures found matching: ${pattern}`);
    console.error('');
    console.error('Available top-level fixtures:');
    const topLevel = new Set();
    const allFixtures = findFixtures('tests/fixtures');
    allFixtures.forEach(f => {
      const parts = f.split('/');
      topLevel.add(parts[0]);
    });
    Array.from(topLevel).sort().forEach(dir => {
      console.error(`  - ${dir}`);
    });
    process.exit(1);
  }

  if (matching.length > 50) {
    console.log(`Found ${matching.length} matching fixtures. Showing first 10:`);
    matching.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    console.log(`  ... and ${matching.length - 10} more`);
  } else {
    console.log(`Found ${matching.length} matching fixture(s):`);
    matching.forEach(f => console.log(`  - ${f}`));
  }

  // Create vitest pattern that matches all found fixtures
  // Escape regex special chars, use word boundaries
  const testPatterns = matching.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const combinedPattern = `should handle (${testPatterns.join('|')})`;

  console.log('');
  console.log(`Running vitest with pattern: ${combinedPattern.substring(0, 60)}...`);
  console.log('');

  try {
    const cmd = `NODE_ENV=test MLLD_NO_STREAMING=true vitest run interpreter/interpreter.fixture.test.ts -t "${combinedPattern}"`;
    // Use ['ignore', 'inherit', 'inherit'] to prevent TTY suspension
    execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (error) {
    process.exit(error.status || 1);
  }
}

main();
