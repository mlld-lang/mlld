# Meld AST Explorer

A tool for exploring and analyzing the Abstract Syntax Tree (AST) produced by Meld's grammar parser.

## Features

- Parse directives and visualize their AST structure
- Generate TypeScript interfaces from AST nodes
- Create test fixtures for grammar parsing
- Generate documentation from AST snapshots
- Process batches of examples

## Installation

The module is part of the Meld codebase. To use it, you need to have the Meld repository cloned and dependencies installed.

```bash
# Install dependencies
npm install
```

## Usage

### Command Line

```bash
# Explore a directive's AST
npm run cli -- explore '@text greeting = "Hello, world!"'

# Generate TypeScript interfaces
npm run cli -- generate-types '@text greeting = "Hello, world!"' -n text-assignment -o ./types/text.ts

# Generate a test fixture
npm run cli -- generate-fixture '@text greeting = "Hello, world!"' -n text-test -o ./fixtures

# Process a batch of examples
npm run cli -- batch examples/directives.json -o ./generated

# Initialize an examples file
npm run cli -- init examples/custom-directives.json
```

### Programmatic Usage

```typescript
import { Explorer } from '../grammar/explorer';

// Create an explorer instance
const explorer = new Explorer({
  outputDir: './generated'
});

// Parse a directive
const ast = explorer.parseDirective('@text greeting = "Hello, world!"');
console.log(JSON.stringify(ast, null, 2));

// Generate types from a directive
explorer.generateTypes('@text greeting = "Hello, world!"', 'text-assignment');

// Process a batch of examples
explorer.processBatch('./examples/directives.json');
```

## Example JSON Structure

```json
[
  {
    "name": "text-assignment",
    "directive": "@text greeting = \"Hello, world!\"",
    "description": "Simple text assignment directive"
  },
  {
    "name": "text-template",
    "directive": "@text template = [[Template with {{var}}]]",
    "description": "Text template directive with variable"
  }
]
```

## Module Structure

```
grammar/explorer/
├── src/              # Source code
│   ├── index.ts      # Main entry point
│   ├── parse.ts      # Parser adapter
│   ├── analyze.ts    # AST analysis utilities
│   ├── explorer.ts   # Main Explorer class
│   ├── batch.ts      # Batch processing utilities
│   ├── cli.ts        # Command-line interface
│   ├── generate/     # Generation utilities
│   │   ├── types.ts        # Type generation
│   │   ├── fixtures.ts     # Test fixture generation
│   │   ├── snapshots.ts    # Snapshot generation
│   │   └── docs.ts         # Documentation generation
├── examples/         # Example directives
├── tests/            # Module tests
```

## API Reference

### Core Classes

#### `Explorer`

The main class for AST exploration and generation.

```typescript
const explorer = new Explorer({
  outputDir: './generated',
  snapshotsDir: './generated/snapshots',
  typesDir: './generated/types',
  fixturesDir: './generated/fixtures',
  docsDir: './generated/docs'
});
```

##### Methods

- `parseDirective(directive: string): DirectiveNode` - Parse a directive string
- `parseFile(filePath: string): DirectiveNode[]` - Parse a file containing directives
- `generateTypes(directive: string, name: string): string` - Generate TypeScript interface
- `generateFixture(directive: string, name: string): string` - Generate a test fixture
- `generateSnapshot(directive: string, name: string): string` - Generate a snapshot
- `compareWithSnapshot(directive: string, name: string): boolean` - Compare with a snapshot
- `processBatch(examplesPath: string): void` - Process a batch of examples
- `processExamples(examples: Example[]): void` - Process examples directly
- `processSnapshots(): void` - Process existing snapshots
- `generateDocs(): void` - Generate documentation

### Core Functions

- `parseDirective(directive: string): DirectiveNode` - Parse a directive string
- `generateTypeInterface(node: DirectiveNode): string` - Generate a TypeScript interface
- `generateTestFixture(directive: string, node: DirectiveNode, name: string): string` - Generate a test fixture
- `generateSnapshot(node: DirectiveNode, name: string, outputDir: string): string` - Generate a snapshot
- `processBatch(examples: Example[], outputDir: string): void` - Process a batch of examples

## Future Extensions

- Watch mode for automatic regeneration
- Visual AST explorer interface
- Type comparison for detecting breaking changes
- Integration with IDE extensions