# AST-SNAPSHOT Plan

## Overview

This document outlines a plan for creating a new streamlined `ast-snapshot` tool that will replace the current AST Explorer implementation. The new tool will focus exclusively on generating:

1. **AST Snapshots**: JSON representations of the Abstract Syntax Tree for example directives
2. **E2E Test Fixtures**: Combined files that include both the AST and expected output for end-to-end testing

Unlike the current AST Explorer, this tool will directly use the real Meld parser, avoiding the need for mock implementations.

## Motivation

The current AST Explorer in `lib/ast-explorer/` has several issues:

1. It uses a mock parser that doesn't accurately represent the real Meld grammar
2. It has complex abstractions and dependencies that make maintenance difficult
3. It includes type generation functionality that's being phased out
4. It has a convoluted directory structure processing model

By creating a simpler script-based approach modeled after `scripts/ast-output.js`, we can:

1. Use the real parser directly for accurate AST generation
2. Simplify maintenance and reduce complexity
3. Focus exclusively on snapshot and fixture generation
4. Align with the project's architectural direction

## Implementation Plan

### 1. Create Script Structure

Create a new script at `scripts/ast-snapshot.js` with the following components:

```javascript
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
  switch (command) {
    case 'snapshot':
      await generateSnapshot(args[0], args[1] || './core/ast/snapshots');
      break;
    case 'fixture':
      await generateFixture(args[0], args[1], args[2] || './core/fixtures');
      break;
    case 'process-examples':
      await processExamples(args[0] || './core/examples', args[1] || './core/ast');
      break;
    default:
      printUsage();
      break;
  }
}

// Run the main function
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

### 2. Implement Core Functionality

#### Snapshot Generation

```javascript
/**
 * Generate a snapshot of the AST for a directive
 */
async function generateSnapshot(directive, outputDir) {
  if (!directive) {
    throw new Error('No directive provided');
  }
  
  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true });
  
  // Parse the directive
  console.log(`Parsing directive: ${directive.substring(0, 30)}...`);
  const ast = parse(directive);
  
  // Generate a snapshot name based on directive kind and subtype
  const name = getSnapshotName(ast);
  
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
```

#### E2E Fixture Generation

```javascript
/**
 * Generate an E2E test fixture that includes both AST and expected output
 */
async function generateFixture(directive, expectedOutput, outputDir) {
  if (!directive) {
    throw new Error('No directive provided');
  }
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  // Generate the AST
  const { ast } = await generateSnapshot(directive, path.join(outputDir, '../snapshots'));
  
  // Generate a fixture name
  const name = getFixtureName(ast);
  
  // Create fixture content
  const fixture = {
    name,
    input: directive,
    expected: expectedOutput || '',
    ast,
    metadata: {
      kind: ast.kind,
      subtype: ast.subtype,
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
```

### 3. Implement the Convention-Based Directory Processing

```javascript
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
  
  // Process each example
  for (const exampleFile of exampleFiles) {
    try {
      await processExampleFile(exampleFile, snapshotsDir, fixturesDir);
    } catch (error) {
      console.error(`Error processing ${exampleFile}:`, error.message);
    }
  }
  
  console.log(`Processed ${snapshots.length} snapshots and ${fixtures.length} fixtures.`);
}
```

### 4. Helper Functions for Directory Structure Processing

```javascript
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
  const expectedPath = examplePath.replace('example', 'expected');
  let expectedContent = '';
  
  try {
    expectedContent = await fs.readFile(expectedPath, 'utf8');
  } catch (error) {
    console.warn(`No expected output file found for ${examplePath}`);
  }
  
  // Extract directives from the example file
  const directives = extractDirectives(content);
  
  // Process each directive
  for (const [index, directive] of directives.entries()) {
    try {
      // Generate snapshot
      const { ast, snapshotPath } = await generateSnapshot(
        directive,
        snapshotsDir,
        `${pathInfo.kind}-${pathInfo.subtype}${pathInfo.variant ? `-${pathInfo.variant}` : ''}${directives.length > 1 ? `-${index + 1}` : ''}`
      );
      
      // Generate fixture if expected output exists
      if (expectedContent) {
        await generateFixture(
          directive,
          expectedContent,
          fixturesDir,
          `${pathInfo.kind}-${pathInfo.subtype}${pathInfo.variant ? `-${pathInfo.variant}` : ''}`
        );
      }
    } catch (error) {
      console.error(`Error processing directive in ${examplePath}:`, error.message);
    }
  }
}
```

### 5. Utility Functions

```javascript
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
  return `${ast.kind}-${ast.subtype}`.toLowerCase();
}

/**
 * Generate a fixture name based on directive kind and subtype
 */
function getFixtureName(ast, customName = '') {
  if (customName) return customName;
  return `${ast.kind}-${ast.subtype}`.toLowerCase();
}
```

### 6. NPM Scripts Integration

Update `package.json` to include scripts for the new tool:

```json
"scripts": {
  // Existing scripts...
  "ast:snapshot": "node scripts/ast-snapshot.js snapshot",
  "ast:fixture": "node scripts/ast-snapshot.js fixture",
  "ast:process": "node scripts/ast-snapshot.js process-examples",
  "ast:process:all": "node scripts/ast-snapshot.js process-examples ./core/examples ./core/ast"
}
```

## Migration Plan

1. **Implement the new script** following the plan above.
2. **Test against a subset of examples** to ensure it correctly generates snapshots and fixtures.
3. **Run a full comparison test** between outputs from the old AST Explorer and the new script.
4. **Update documentation** to reflect the new approach.
5. **Update dependent build scripts** to use the new tool.
6. **Deprecate the old AST Explorer** in `lib/ast-explorer/`.

## Benefits

1. **Accuracy**: Using the real parser ensures AST snapshots accurately reflect the language.
2. **Simplicity**: The script-based approach is much simpler than the full AST Explorer implementation.
3. **Maintenance**: Easier to maintain and update as the grammar evolves.
4. **Integration**: Better integrates with the rest of the codebase and build process.
5. **Performance**: Direct parser access should lead to better performance.

## Future Improvements

1. **Parallel processing** for large sets of examples
2. **Differential snapshot testing** to catch grammar changes
3. **Integration with the testing framework** for automated verification
4. **Visualization options** for AST structure