#!/usr/bin/env node
/**
 * Fixture Generator Script
 * 
 * Processes test cases in grammar/cases/* and generates fixtures in grammar/fixtures/*
 */
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Extract individual directives from a document
 */
function extractDirectives(content) {
  const directiveLines = [];
  const lines = content.split('\n');
  let currentDirective = '';
  
  for (const line of lines) {
    // Check if this is a directive line
    if (line.trim().startsWith('@')) {
      // If it's a new directive (not a continuation)
      if (line.match(/^@(text|run|import|path|data|add|exec)\s/)) {
        if (currentDirective) {
          directiveLines.push(currentDirective);
        }
        currentDirective = line;
      } else {
        // Continuation of previous directive
        currentDirective += '\n' + line;
      }
    }
  }
  
  // Add the last directive if exists
  if (currentDirective) {
    directiveLines.push(currentDirective);
  }
  
  return directiveLines;
}

/**
 * Process all test cases and generate fixtures
 */
async function buildFixtures() {
  console.log('Building fixtures from test cases...');
  
  // Find all valid test cases
  const validCases = glob.sync('grammar/cases/valid/**/example.md');
  const invalidCases = glob.sync('grammar/cases/invalid/**/example.md');
  
  // Ensure output directory exists
  const fixturesDir = path.join('grammar/fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });
  
  // Process valid cases
  for (const examplePath of validCases) {
    // Get directory and case name
    const dir = path.dirname(examplePath);
    const caseName = path.basename(dir);
    
    console.log(`Processing ${caseName}...`);
    
    // Read input and expected output
    const input = fs.readFileSync(examplePath, 'utf8');
    const expectedPath = path.join(dir, 'expected.md');
    const expected = fs.existsSync(expectedPath) ? 
      fs.readFileSync(expectedPath, 'utf8') : null;
    
    // Extract directives for AST analysis
    const directives = extractDirectives(input);
    
    // Create the fixture
    const fixture = {
      name: caseName,
      input,
      expected,
      directives
    };
    
    // Write to fixture file
    fs.writeFileSync(
      path.join(fixturesDir, `${caseName}.json`),
      JSON.stringify(fixture, null, 2)
    );
    
    console.log(`Generated fixture for ${caseName}`);
  }
  
  // Process invalid cases
  for (const examplePath of invalidCases) {
    // Similar processing for invalid cases
    const dir = path.dirname(examplePath);
    const caseName = path.basename(dir);
    
    console.log(`Processing invalid case ${caseName}...`);
    
    const input = fs.readFileSync(examplePath, 'utf8');
    const errorPath = path.join(dir, 'error.md');
    const error = fs.existsSync(errorPath) ? 
      fs.readFileSync(errorPath, 'utf8') : 'Unknown error';
    
    const directives = extractDirectives(input);
    
    const fixture = {
      name: caseName,
      input,
      error,
      directives,
      isValid: false
    };
    
    fs.writeFileSync(
      path.join(fixturesDir, `${caseName}.json`),
      JSON.stringify(fixture, null, 2)
    );
    
    console.log(`Generated invalid fixture for ${caseName}`);
  }
  
  console.log('Fixture generation complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildFixtures().catch(err => {
    console.error('Error building fixtures:', err);
    process.exit(1);
  });
}

export { buildFixtures, extractDirectives };