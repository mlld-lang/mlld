# Pragmatic AST Explorer Implementation Plan

Let's cut through all the enterprise-architecture-astronaut nonsense and build something immediately useful in days, not months!

## What We Actually Need (5 days max)

### Day 1: Basic AST Explorer Script (1 day)

Create a simple script that:
1. Takes a directive string as input
2. Parses it using your existing grammar
3. Outputs the resulting AST structure
4. Saves it as TypeScript or JSON

```typescript
// ast-explorer.ts - The entire utility in ~50 lines
import * as fs from 'fs';
import { parse } from '../path/to/your/parser';

// Parse a directive and output its AST
function exploreAST(directive: string, outputPath?: string) {
  try {
    // Parse the directive
    const ast = parse(directive);
    
    // Output to console if no path provided
    if (!outputPath) {
      console.log(JSON.stringify(ast, null, 2));
      return ast;
    }
    
    // Write to file if path provided
    fs.writeFileSync(outputPath, JSON.stringify(ast, null, 2));
    console.log(`AST written to ${outputPath}`);
    return ast;
  } catch (error) {
    console.error("Parsing error:", error);
    throw error;
  }
}

// Handle command line usage
if (require.main === module) {
  const directive = process.argv[2];
  const outputPath = process.argv[3];
  
  if (!directive) {
    console.log("Usage: ts-node ast-explorer.ts 'directive' [outputPath]");
    process.exit(1);
  }
  
  exploreAST(directive, outputPath);
}

export { exploreAST };
```

### Day 2: Generate Types from AST (1 day)

Create a simple type generator that:
1. Takes an AST as input
2. Generates TypeScript interface definitions
3. Outputs them to a file

```typescript
// type-generator.ts - Simple type generator in ~100 lines
import * as fs from 'fs';
import { exploreAST } from './ast-explorer';

// Generate a TypeScript interface from an object
function generateInterface(obj: any, name: string, indent = 0): string {
  const pad = ' '.repeat(indent);
  let result = `${pad}export interface ${name} {\n`;
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value === null) {
      result += `${pad}  ${key}: null;\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result += `${pad}  ${key}: any[];\n`;
      } else {
        const itemType = typeof value[0] === 'object' && value[0] !== null
          ? `${name}${key.charAt(0).toUpperCase() + key.slice(1)}Item`
          : typeof value[0];
        
        result += `${pad}  ${key}: ${itemType}[];\n`;
        
        // Generate interface for array items if they're objects
        if (typeof value[0] === 'object' && value[0] !== null) {
          result += generateInterface(value[0], itemType, indent + 2);
        }
      }
    } else if (typeof value === 'object') {
      const nestedName = `${name}${key.charAt(0).toUpperCase() + key.slice(1)}`;
      result += `${pad}  ${key}: ${nestedName};\n`;
      result += generateInterface(value, nestedName, indent + 2);
    } else {
      result += `${pad}  ${key}: ${typeof value};\n`;
    }
  });
  
  result += `${pad}};\n`;
  return result;
}

// Generate types from a directive
function generateTypes(directive: string, interfaceName: string, outputPath: string) {
  // Parse the directive to get AST
  const ast = exploreAST(directive);
  
  // Generate TypeScript interface
  const typeDefinition = generateInterface(ast, interfaceName);
  
  // Write to file
  fs.writeFileSync(outputPath, typeDefinition);
  console.log(`Type definition written to ${outputPath}`);
}

// Handle command line usage
if (require.main === module) {
  const directive = process.argv[2];
  const interfaceName = process.argv[3] || 'DirectiveNode';
  const outputPath = process.argv[4] || './generated-types.ts';
  
  if (!directive) {
    console.log("Usage: ts-node type-generator.ts 'directive' [interfaceName] [outputPath]");
    process.exit(1);
  }
  
  generateTypes(directive, interfaceName, outputPath);
}

export { generateTypes, generateInterface };
```

### Day 3: Create a Test Fixture Generator (1 day)

Build a simple script that:
1. Takes an example directive
2. Generates a test fixture with expected AST
3. Outputs it in your test framework format

```typescript
// fixture-generator.ts - Quick test fixture generator
import * as fs from 'fs';
import { exploreAST } from './ast-explorer';

// Generate a Vitest test fixture
function generateVitestFixture(directive: string, name: string, outputPath: string) {
  // Parse the directive
  const ast = exploreAST(directive);
  
  // Generate test file content
  const testContent = `
import { describe, it, expect } from 'vitest';
import { parse } from '../path/to/your/parser';

describe('${name}', () => {
  it('should parse correctly', () => {
    const directive = \`${directive.replace(/`/g, '\\`')}\`;
    
    const result = parse(directive);
    
    // Test key properties
    expect(result.type).toBe('${ast.type}');
    expect(result.kind).toBe('${ast.kind}');
    ${ast.subtype ? `expect(result.subtype).toBe('${ast.subtype}');` : ''}
    
    // Full AST comparison
    expect(result).toMatchObject(${JSON.stringify(ast, null, 2)});
  });
});
`;
  
  // Write to file
  fs.writeFileSync(outputPath, testContent);
  console.log(`Test fixture written to ${outputPath}`);
}

// Handle command line usage
if (require.main === module) {
  const directive = process.argv[2];
  const name = process.argv[3] || 'DirectiveTest';
  const outputPath = process.argv[4] || './generated-test.ts';
  
  if (!directive) {
    console.log("Usage: ts-node fixture-generator.ts 'directive' [name] [outputPath]");
    process.exit(1);
  }
  
  generateVitestFixture(directive, name, outputPath);
}

export { generateVitestFixture };
```

### Day 4: Batch Processing for Multiple Directives (1 day)

Create a utility to process multiple examples at once:

```typescript
// batch-processor.ts - Process multiple directives at once
import * as fs from 'fs';
import * as path from 'path';
import { exploreAST } from './ast-explorer';
import { generateTypes } from './type-generator';
import { generateVitestFixture } from './fixture-generator';

interface Example {
  name: string;
  directive: string;
}

// Process multiple examples from a JSON file
function processExamples(examplesPath: string, outputDir: string) {
  // Create output directories
  const typesDir = path.join(outputDir, 'types');
  const fixturesDir = path.join(outputDir, 'fixtures');
  const snapshotsDir = path.join(outputDir, 'snapshots');
  
  [typesDir, fixturesDir, snapshotsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Read examples
  const examples: Example[] = JSON.parse(fs.readFileSync(examplesPath, 'utf8'));
  
  // Process each example
  examples.forEach(example => {
    // Generate AST snapshot
    const snapshot = exploreAST(example.directive);
    fs.writeFileSync(
      path.join(snapshotsDir, `${example.name}.json`),
      JSON.stringify(snapshot, null, 2)
    );
    
    // Generate TypeScript interface
    generateTypes(
      example.directive,
      `${example.name.charAt(0).toUpperCase() + example.name.slice(1)}Node`,
      path.join(typesDir, `${example.name}.ts`)
    );
    
    // Generate test fixture
    generateVitestFixture(
      example.directive,
      example.name,
      path.join(fixturesDir, `${example.name}.test.ts`)
    );
  });
  
  // Generate index files
  generateIndexFiles(examples, outputDir);
  
  console.log(`Processed ${examples.length} examples`);
}

// Generate index files for types and tests
function generateIndexFiles(examples: Example[], outputDir: string) {
  // Generate types index
  const typesIndex = examples.map(example => {
    const name = example.name.charAt(0).toUpperCase() + example.name.slice(1) + 'Node';
    return `export { ${name} } from './${example.name}';`;
  }).join('\n');
  
  fs.writeFileSync(
    path.join(outputDir, 'types', 'index.ts'),
    typesIndex
  );
  
  console.log('Generated index files');
}

// Handle command line usage
if (require.main === module) {
  const examplesPath = process.argv[2];
  const outputDir = process.argv[3] || './generated';
  
  if (!examplesPath) {
    console.log("Usage: ts-node batch-processor.ts examples.json [outputDir]");
    process.exit(1);
  }
  
  processExamples(examplesPath, outputDir);
}

export { processExamples };
```

### Day 5: Simple CLI Wrapper for All Functionality (1 day)

Create a CLI that ties everything together:

```typescript
// ast-tools.ts - CLI wrapper
#!/usr/bin/env node
import { program } from 'commander';
import { exploreAST } from './ast-explorer';
import { generateTypes } from './type-generator';
import { generateVitestFixture } from './fixture-generator';
import { processExamples } from './batch-processor';

program
  .name('ast-tools')
  .description('AST exploration and generation tools')
  .version('0.1.0');

program
  .command('explore')
  .description('Parse a directive and show its AST')
  .argument('<directive>', 'directive to parse')
  .option('-o, --output <file>', 'output file path')
  .action((directive, options) => {
    exploreAST(directive, options.output);
  });

program
  .command('generate-types')
  .description('Generate TypeScript types from a directive')
  .argument('<directive>', 'directive to parse')
  .option('-n, --name <name>', 'interface name', 'DirectiveNode')
  .option('-o, --output <file>', 'output file path', './generated-types.ts')
  .action((directive, options) => {
    generateTypes(directive, options.name, options.output);
  });

program
  .command('generate-fixture')
  .description('Generate a test fixture from a directive')
  .argument('<directive>', 'directive to parse')
  .option('-n, --name <name>', 'test name', 'DirectiveTest')
  .option('-o, --output <file>', 'output file path', './generated-test.ts')
  .action((directive, options) => {
    generateVitestFixture(directive, options.name, options.output);
  });

program
  .command('batch')
  .description('Process multiple examples from a JSON file')
  .argument('<examples>', 'JSON file with examples')
  .option('-o, --output <dir>', 'output directory', './generated')
  .action((examples, options) => {
    processExamples(examples, options.output);
  });

program.parse();
```

## Example Usage

```bash
# Explore a directive's AST
npx ast-tools explore '@text greeting = "Hello, world!"'

# Generate types for a directive
npx ast-tools generate-types '@text greeting = "Hello, world!"' -n TextAssignmentNode -o ./types/text-assignment.ts

# Generate a test fixture
npx ast-tools generate-fixture '@text greeting = "Hello, world!"' -n TextAssignmentTest -o ./tests/text-assignment.test.ts

# Process multiple examples from a JSON file
npx ast-tools batch examples.json -o ./generated
```

## Example JSON Structure

```json
[
  {
    "name": "text-assignment",
    "directive": "@text greeting = \"Hello, world!\""
  },
  {
    "name": "text-template",
    "directive": "@text template = [[Value with {{variable}}]]"
  },
  {
    "name": "run-command",
    "directive": "@run echo \"Hello, world!\""
  }
]
```

## That's It!

This lightweight approach gives you:
1. A utility to explore AST structure for any directive
2. Quick generation of TypeScript types from actual AST
3. Test fixture generation for regression testing
4. Batch processing for multiple examples
5. A simple CLI that ties it all together

No architecture astronauting, no three-month project plan, no "enterprise integration frameworks" - just practical tools that deliver immediate value with minimal code.

You can build this in a few days, get immediate value, and then decide if/when you want to enhance it further!

## Extending The Approach

If the tool proves valuable, here are some simple extensions you might consider:

1. **Watch Mode**: Watch specific directories for changes and auto-regenerate types/fixtures
2. **Type Refinement**: Allow manual edits to generated types with markers that aren't overwritten
3. **Documentation Generation**: Extract JSDoc comments from the types
4. **Framework Integration**: Support other test frameworks (Jest, etc.)

But start with the minimal viable product and only add what you actually need!