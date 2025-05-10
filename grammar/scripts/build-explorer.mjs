#!/usr/bin/env node
/**
 * Main Build Script for Unified AST-E2E Framework
 */
import { buildFixtures } from './build-fixtures.mjs';
import { generateASTArtifacts } from './generate-types.mjs';

/**
 * Main build function
 */
async function build() {
  console.log('Building Unified AST and E2E Framework...');
  
  // Step 1: Generate fixtures from test cases
  console.log('\n=== Generating Fixtures ===');
  await buildFixtures();
  
  // Step 2: Generate AST artifacts
  console.log('\n=== Generating AST Artifacts ===');
  await generateASTArtifacts();
  
  console.log('\nBuild complete! ✅');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}