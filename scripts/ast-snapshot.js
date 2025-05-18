#!/usr/bin/env node
/**
 * AST Snapshot Generator
 * 
 * Generates snapshots and fixtures from Meld example directives.
 * Uses the real Meld parser for accurate AST representation.
 * 
 * Usage:
 *   node scripts/ast-snapshot.js snapshot "@text greeting = \"Hello, world!\""
 *   node scripts/ast-snapshot.js process-examples ./core/examples
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '../core/ast/grammar/parser.js';
import { glob } from 'glob';

// Command line argument parsing
const command = process.argv[2];
const args = process.argv.slice(3);

// Main entry point
async function main() {
  try {
    switch (command) {
      case 'snapshot':
        await generateSnapshot(args[0], args[1] || './core/ast/snapshots');
        break;
      case 'fixture':
        await generateFixture(args[0], args[1], args[2] || './core/ast/fixtures');
        break;
      case 'process-examples':
        await processExamples(args[0] || './core/examples', args[1] || './core/ast');
        break;
      default:
        printUsage();
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
AST Snapshot Generator

Generates snapshots and fixtures from Meld example directives.
Uses the real Meld parser for accurate AST representation.

Commands:
  snapshot <directive> [outputDir]       Generate a snapshot of a directive
  fixture <directive> <expected> [outputDir]  Generate a fixture with expected output
  process-examples [examplesDir] [outputDir]  Process example files from a directory

Examples:
  node scripts/ast-snapshot.js snapshot "@text greeting = \\"Hello, world!\\""
  node scripts/ast-snapshot.js fixture "@text greeting = \\"Hello\\"" "Hello"
  node scripts/ast-snapshot.js process-examples ./core/examples
  `);
}

/**
 * Generate a snapshot of the AST for a directive
 */
async function generateSnapshot(directive, outputDir, customName) {
  if (!directive) {
    throw new Error('No directive provided');
  }
  
  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });
  
  // Parse the directive
  console.log(`Parsing directive: ${directive.substring(0, 30)}...`);
  const ast = parse(directive);
  
  // Generate a snapshot name based on directive kind and subtype
  const name = customName || getSnapshotName(ast);
  
  // Create the snapshot
  const snapshotPath = path.join(outputDir, `${name}.snapshot.json`);
  
  // Write the snapshot
  await fs.writeFile(
    snapshotPath,
    JSON.stringify(ast, null, 2)
  );
  
  console.log(`Snapshot written to: ${snapshotPath}`);
  return { ast, snapshotPath };
}

/**
 * Generate an E2E test fixture that includes both AST and expected output
 */
async function generateFixture(directive, expectedOutput, outputDir, customName) {
  if (!directive) {
    throw new Error('No directive provided');
  }
  
  if (expectedOutput === undefined) {
    throw new Error('Expected output is required for fixtures');
  }
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  // Create snapshots directory if needed
  const snapshotsDir = path.join(outputDir, '../snapshots');
  await fs.mkdir(snapshotsDir, { recursive: true });
  
  // Generate the AST
  console.log(`Parsing directive: ${directive.substring(0, 30)}...`);
  const ast = parse(directive);
  
  // Generate names
  const name = customName || getFixtureName(ast);
  
  // Save the snapshot
  const snapshotPath = path.join(snapshotsDir, `${name}.snapshot.json`);
  await fs.writeFile(
    snapshotPath,
    JSON.stringify(ast, null, 2)
  );
  console.log(`Snapshot written to: ${snapshotPath}`);
  
  // Create fixture content
  const fixture = {
    name,
    input: directive,
    expected: expectedOutput,
    ast,
    metadata: {
      kind: Array.isArray(ast) ? ast[0].kind : ast.kind,
      subtype: Array.isArray(ast) ? ast[0].subtype : ast.subtype,
    }
  };
  
  // Write the fixture
  const fixturePath = path.join(outputDir, `${name}.fixture.json`);
  await fs.writeFile(
    fixturePath,
    JSON.stringify(fixture, null, 2)
  );
  
  console.log(`Fixture written to: ${fixturePath}`);
  return { fixture, fixturePath };
}

/**
 * Process examples from a conventional directory structure
 */
async function processExamples(examplesDir, outputDir) {
  const snapshots = [];
  const fixtures = [];
  
  // Create output directories
  const snapshotsDir = path.join(outputDir, 'snapshots');
  const fixturesDir = path.join(outputDir, 'fixtures');
  
  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.mkdir(fixturesDir, { recursive: true });
  
  console.log(`Processing examples from ${examplesDir}...`);
  
  // Discover example files
  const exampleFiles = await findExampleFiles(examplesDir);
  console.log(`Found ${exampleFiles.length} example files.`);
  
  // Process each example
  for (const exampleFile of exampleFiles) {
    try {
      const result = await processExampleFile(exampleFile, snapshotsDir, fixturesDir);
      if (result) {
        if (result.snapshots) snapshots.push(...result.snapshots);
        if (result.fixtures) fixtures.push(...result.fixtures);
      }
    } catch (error) {
      console.error(`Error processing ${exampleFile}:`, error.message);
    }
  }
  
  console.log(`Processed ${snapshots.length} snapshots and ${fixtures.length} fixtures.`);
}

/**
 * Find all example files in the conventional directory structure
 */
async function findExampleFiles(baseDir) {
  // Find all example files that match the pattern
  const exampleFiles = await glob(`${baseDir}/**/example*.md`);
  return exampleFiles;
}

/**
 * Process a single example file and its expected output
 */
async function processExampleFile(examplePath, snapshotsDir, fixturesDir) {
  // Read the example file
  const content = await fs.readFile(examplePath, 'utf8');
  
  // Extract directive info from path
  const pathInfo = extractPathInfo(examplePath);
  
  // Find expected output file if it exists
  // Handle both 'example.md' and 'example-variant.md' formats
  const filename = path.basename(examplePath);
  const dirname = path.dirname(examplePath);
  let expectedFilename;
  
  if (filename.startsWith('example-')) {
    // For example-variant.md files, look for expected-variant.md
    const variant = filename.replace('example-', '');
    expectedFilename = `expected-${variant}`;
  } else {
    // For example.md files, look for expected.md
    expectedFilename = 'expected.md';
  }
  
  const expectedPath = path.join(dirname, expectedFilename);
  let expectedContent = '';
  let hasExpectedOutput = false;
  
  try {
    expectedContent = await fs.readFile(expectedPath, 'utf8');
    hasExpectedOutput = true;
    console.log(`Found expected output file: ${expectedPath}`);
  } catch (error) {
    console.warn(`No expected output file found: ${expectedPath}`);
  }
  
  // Extract directives from the example file
  const directives = extractDirectives(content);
  
  const results = {
    snapshots: [],
    fixtures: []
  };
  
  // Process directives - for fixtures with expected output, include all directive ASTs
  if (hasExpectedOutput && directives.length > 0) {
    // Parse all directives to collect their ASTs
    const allAsts = [];
    const allInputs = [];
    const allMetadata = [];
    
    for (const directive of directives) {
      try {
        const ast = parse(directive);
        allAsts.push(...ast); // parser returns array, so spread it
        allInputs.push(directive);
        
        // Collect metadata for each directive
        const node = Array.isArray(ast) ? ast[0] : ast;
        if (node) {
          allMetadata.push({
            kind: node.kind,
            subtype: node.subtype
          });
        }
      } catch (error) {
        console.error(`Error parsing directive: ${directive}`, error.message);
      }
    }
    
    // Create a single fixture with all ASTs
    const baseName = `${pathInfo.kind}-${pathInfo.subtype}${pathInfo.variant ? `-${pathInfo.variant}` : ''}`;
    
    const fixture = {
      name: baseName,
      input: allInputs.join('\n'),
      expected: expectedContent,
      directives: allInputs,
      ast: allAsts,
      metadata: {
        kind: pathInfo.kind,
        subtype: pathInfo.subtype,
        ...(pathInfo.variant && { variant: pathInfo.variant })
      }
    };
    
    // Write the fixture
    const fixturePath = path.join(fixturesDir, `${baseName}.fixture.json`);
    await fs.writeFile(
      fixturePath,
      JSON.stringify(fixture, null, 2)
    );
    
    console.log(`Fixture written to: ${fixturePath}`);
    results.fixtures.push({ fixture, path: fixturePath });
  } else {
    // Process each directive separately for snapshots only
    for (const [index, directive] of directives.entries()) {
      try {
        // Create a base name for this snapshot
        const baseName = `${pathInfo.kind}-${pathInfo.subtype}${pathInfo.variant ? `-${pathInfo.variant}` : ''}${directives.length > 1 ? `-${index + 1}` : ''}`;
        
        // Generate a snapshot
        const { ast, snapshotPath } = await generateSnapshot(
          directive,
          snapshotsDir,
          baseName
        );
        
        results.snapshots.push({ ast, path: snapshotPath });
      } catch (error) {
        console.error(`Error processing directive in ${examplePath}:`, error.message);
      }
    }
  }
  
  return results;
}

/**
 * Extract directives from a text file
 */
function extractDirectives(content) {
  const directives = [];
  const lines = content.split('\n');
  
  let currentDirective = '';
  let inDirective = false;
  
  for (const line of lines) {
    if (line.trim().startsWith('@')) {
      // If we were already in a directive, save it
      if (inDirective) {
        directives.push(currentDirective);
      }
      
      // Start a new directive
      currentDirective = line;
      inDirective = true;
    } else if (inDirective && line.trim() !== '') {
      // Continue the current directive
      currentDirective += '\n' + line;
    } else if (inDirective) {
      // Empty line ends the directive
      directives.push(currentDirective);
      currentDirective = '';
      inDirective = false;
    }
  }
  
  // Don't forget the last directive
  if (inDirective) {
    directives.push(currentDirective);
  }
  
  return directives;
}

/**
 * Extract path information from an example file path
 */
function extractPathInfo(examplePath) {
  // Example: /core/examples/text/assignment/example.md
  const parts = examplePath.split('/');
  
  // Get the example filename
  const filename = parts[parts.length - 1];
  
  // Determine if this is a variant
  let variant = '';
  if (filename.startsWith('example-')) {
    variant = filename.replace('example-', '').replace('.md', '');
  }
  
  // Find the kind and subtype from the path
  let kind = 'unknown';
  let subtype = 'unknown';
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'examples' && i + 2 < parts.length) {
      kind = parts[i + 1];
      subtype = parts[i + 2];
      break;
    }
  }
  
  return { kind, subtype, variant };
}

/**
 * Generate a snapshot name based on directive kind and subtype
 */
function getSnapshotName(ast, customName = '') {
  if (customName) return customName;
  
  // The parser returns an array of nodes, get the first node
  const node = Array.isArray(ast) ? ast[0] : ast;
  
  if (!node || !node.kind || !node.subtype) {
    console.warn('Could not determine kind/subtype from AST, using generic name');
    return 'generic-snapshot';
  }
  
  return `${node.kind}-${node.subtype}`.toLowerCase();
}

/**
 * Generate a fixture name based on directive kind and subtype
 */
function getFixtureName(ast, customName = '') {
  if (customName) return customName;
  
  // The parser returns an array of nodes, get the first node
  const node = Array.isArray(ast) ? ast[0] : ast;
  
  if (!node || !node.kind || !node.subtype) {
    console.warn('Could not determine kind/subtype from AST, using generic name');
    return 'generic-fixture';
  }
  
  return `${node.kind}-${node.subtype}`.toLowerCase();
}

// Run the main function
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});