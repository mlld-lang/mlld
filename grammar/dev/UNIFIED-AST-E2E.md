# Unified AST Explorer and E2E Testing Framework

This document outlines a comprehensive approach to unify Abstract Syntax Tree (AST) exploration and End-to-End (E2E) testing for the Mlld grammar system. By adopting a convention-over-configuration approach, we can simplify the development workflow while ensuring complete test coverage and type accuracy.

## Core Concept

The unified framework leverages a single source of truth for test cases, using consistent file naming conventions to avoid configuration complexity. Each test case defines both the AST structure for grammar type generation and the expected output for E2E validation.

## Directory Structure

```
mlld/
├── grammar/
│   ├── cases/                 # Source test cases using conventions
│   │   ├── valid/             # Valid Mlld documents
│   │   │   ├── text-variables/
│   │   │   │   ├── example.md     # Input document with directives
│   │   │   │   └── expected.md    # Expected output
│   │   │   └── nested-directives/
│   │   │       ├── example.md
│   │   │       └── expected.md
│   │   └── invalid/           # Invalid documents (error cases)
│   │       └── missing-bracket/
│   │           ├── example.md
│   │           └── error.md       # Error description
│   │
│   ├── fixtures/              # Generated fixtures (JSON)
│   │   ├── text-variables.json    # Combined fixture with directives and expected output
│   │   └── nested-directives.json
│   │
│   ├── explorer/              # AST Explorer tool
│   │   └── src/
│   │       ├── command.ts         # CLI interface
│   │       ├── explorer.ts        # Main Explorer class
│   │       └── ...
│   │
│   ├── generated/             # Generated outputs from AST Explorer
│   │   ├── snapshots/             # AST snapshots
│   │   ├── types/                 # TypeScript interfaces
│   │   └── docs/                  # Documentation
│   │
│   └── types/                 # Final type system
│       ├── directives/            # Directive-specific types
│       └── ...
│
└── tests/
    └── e2e/                   # E2E tests using fixtures
```

## Implementation Components

### 1. Test Case Format

Test cases follow a simple convention:

- **Directory Name**: Serves as the test case identifier (e.g., `text-variables`)
- **`example.md`**: Input document containing Mlld directives
- **`expected.md`**: Expected output after processing
- **`error.md`** (for invalid cases): Expected error information

### 2. Fixture Generator

The fixture generator processes conventional test cases into unified JSON fixtures:

```typescript
// scripts/build-fixtures.ts
import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';

/**
 * Extract individual directives from a document
 */
function extractDirectives(content: string): string[] {
  const directiveLines: string[] = [];
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
export async function buildFixtures() {
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
}
```

### 3. AST Generation Script

```typescript
// scripts/generate-ast.ts
import * as fs from 'fs';
import * as path from 'path';
import { Explorer } from '../grammar/explorer/src/explorer';
import glob from 'glob';

/**
 * Generate AST snapshots and types from fixtures
 */
export async function generateASTArtifacts() {
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
    
    // Process each directive in the fixture
    directives.forEach((directive: string, index: number) => {
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
}
```

### 4. E2E Test Runner

```typescript
// tests/e2e/runner.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';
import { processMlldDocument } from '../../src/processor';

/**
 * Run E2E tests using generated fixtures
 */
export function runE2ETests() {
  describe('Mlld E2E Processing', () => {
    // Valid test cases
    describe('Valid documents', () => {
      const fixtures = glob.sync('grammar/fixtures/*.json')
        .map(fixturePath => {
          const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
          return fixture.isValid !== false ? fixture : null;
        })
        .filter(Boolean);
      
      for (const fixture of fixtures) {
        it(`correctly processes ${fixture.name}`, async () => {
          // Process document
          const result = await processMlldDocument(fixture.input);
          
          // Compare with expected output
          expect(result.trim()).toEqual(fixture.expected.trim());
        });
      }
    });
    
    // Invalid test cases
    describe('Invalid documents', () => {
      const fixtures = glob.sync('grammar/fixtures/*.json')
        .map(fixturePath => {
          const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
          return fixture.isValid === false ? fixture : null;
        })
        .filter(Boolean);
      
      for (const fixture of fixtures) {
        it(`correctly handles errors in ${fixture.name}`, async () => {
          await expect(async () => {
            await processMlldDocument(fixture.input);
          }).rejects.toThrow();
          
          // Could add more specific error assertions based on fixture.error
        });
      }
    });
  });
}
```

### 5. Master Build Script

```typescript
// scripts/build-explorer.ts
import { buildFixtures } from './build-fixtures';
import { generateASTArtifacts } from './generate-ast';

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

// Run build process
build().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
```

### 6. Package.json Integration

```json
{
  "scripts": {
    "build:explorer": "ts-node scripts/build-explorer.ts",
    "test:e2e": "vitest run tests/e2e/runner.ts",
    "generate:fixtures": "ts-node scripts/build-fixtures.ts",
    "generate:ast": "ts-node scripts/generate-ast.ts"
  }
}
```

## Usage Workflow

### Creating a New Test Case

1. **Create a directory** with a descriptive name:
   ```bash
   mkdir -p grammar/cases/valid/text-with-variables
   ```

2. **Create example.md** with the input document:
   ```markdown
   # Example Document
   
   This is a simple example.
   
   @text greeting = "Hello"
   @text name = "World"
   @add [[{{greeting}}, {{name}}!]]
   ```

3. **Create expected.md** with the expected output:
   ```markdown
   # Example Document
   
   This is a simple example.
   
   
   
   Hello, World!
   ```

4. **Generate fixtures and AST artifacts**:
   ```bash
   npm run build:explorer
   ```

### Running Tests

```bash
# Run E2E tests
npm run test:e2e

# Run specific tests
npm test tests/e2e/specific-test.ts
```

## Type Generation Integration

The unified framework integrates with the AST-based type system described in AST-PLAN-REVISED.md:

1. **Fixtures drive AST snapshots** for all directive variants
2. **AST snapshots drive type generation** for the grammar type system
3. **Generated types are used for validation** in both parsing and E2E processing

## Benefits

This unified approach provides several key advantages:

1. **Simplicity**: Convention-based structure eliminates complex configuration
2. **Single Source of Truth**: Test cases drive both AST exploration and E2E testing
3. **Completeness**: Ensures AST structure matches actual directives in documents
4. **Maintainability**: Easy to add and update test cases
5. **Visibility**: Clear documentation of what's expected from each case
6. **Automation**: Generate fixtures, snapshots, and types in one step
7. **Test Coverage**: Every edge case is captured in both parsing and output validation

## Implementation Plan

### Phase 1: Basic Framework (1-2 days)

1. Create directory structure
2. Implement basic scripts for fixture generation
3. Add AST snapshot generation for directives

### Phase 2: Type Generation (1-2 days)

1. Integrate AST Explorer with fixture processing  
2. Implement type generation from directives
3. Create helper scripts for automation

### Phase 3: E2E Test Integration (1-2 days)

1. Create E2E test runner using fixtures
2. Convert existing E2E tests to new format
3. Add validation for test expectations

### Phase 4: Documentation and Refinement (1 day)

1. Document usage patterns
2. Add utilities for common test case operations
3. Optimize build performance

## Future Extensions

1. **Visual Explorer**: Add a visual explorer for AST structures
2. **Automated Example Generation**: Generate examples from type definitions
3. **Snapshot Comparison**: Visual diff tool for comparing AST changes
4. **Test Coverage Analysis**: Track which grammar features are tested

## Conclusion

The Unified AST Explorer and E2E Testing Framework provides a comprehensive solution for ensuring alignment between grammar implementation, type definitions, and actual document processing. By adopting a convention-over-configuration approach, it simplifies the development workflow while maintaining robust test coverage and type accuracy.