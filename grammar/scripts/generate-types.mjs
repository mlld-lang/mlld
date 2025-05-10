#!/usr/bin/env node
/**
 * AST Generation Script
 * 
 * Uses the AST Explorer to generate snapshots and types from fixtures
 */
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { Explorer } from '../explorer/src/explorer.js';

/**
 * Generate AST snapshots and types from fixtures
 */
async function generateASTArtifacts() {
  console.log('Generating AST artifacts from fixtures...');
  
  // Create explorer instance
  const explorer = new Explorer({
    outputDir: path.join('grammar/generated')
  });
  
  // Get all fixtures
  const fixtures = glob.sync('grammar/fixtures/*.json');
  
  // Process each fixture
  for (const fixturePath of fixtures) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const { name, directives } = fixture;
    
    console.log(`Processing fixture ${name}...`);
    
    // Process each directive in the fixture
    directives.forEach((directive, index) => {
      console.log(`  Directive ${index + 1}: ${directive.substring(0, 40)}...`);
      
      // Generate snapshot
      explorer.generateSnapshot(
        directive,
        `${name}-directive-${index + 1}`,
        path.join('grammar/generated/snapshots')
      );
      
      // Generate type definition
      explorer.generateTypes(
        directive,
        `${name}-directive-${index + 1}`,
        path.join('grammar/generated/types')
      );
    });
    
    console.log(`Generated AST artifacts for ${name}`);
  }
  
  console.log('AST artifact generation complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateASTArtifacts().catch(err => {
    console.error('Error generating AST artifacts:', err);
    process.exit(1);
  });
}

export { generateASTArtifacts };