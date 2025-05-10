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

## Configuration

The AST Explorer can be configured using a configuration file named `ast-explorer.config.json` in your project root. This allows you to customize paths for input and output directories.

Example configuration:

```json
{
  "paths": {
    "parserPath": "./grammar/parser.cjs",
    "examplesDir": "./grammar/examples",
    "outputDir": "./core/ast/generated",
    "typesOutputDir": "./core/ast/generated/types",
    "snapshotsDir": "./core/ast/generated/snapshots",
    "fixturesDir": "./core/ast/generated/fixtures",
    "docsOutputDir": "./core/ast/generated/docs"
  },
  "options": {
    "useMockParser": false,
    "verbose": false
  }
}
```

You can also specify a custom configuration file path using the `-c` or `--config` option in CLI commands.

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

# Process examples using convention-based directory structure
npm run process-all -- -d ./core/examples -o ./core/generated

# Initialize an examples file
npm run cli -- init examples/custom-directives.json
```

### Convention-Based Directory Structure

The AST Explorer now supports a convention-based approach for organizing examples. Use this structure:

```
core/examples/
├── directivekind/             # e.g., text, run, import
│   └── directivesubtype/      # e.g., assignment, template
│       ├── example.md         # Base example
│       ├── expected.md        # Expected output for base example
│       ├── example-variant.md # Variant example (e.g., multiline)
│       └── expected-variant.md # Expected output for variant
```

This structure allows you to:
- Organize examples by directive kind and subtype
- Support variant examples with the naming pattern 'example-{variant}.md'
- Associate expected outputs with the naming pattern 'expected[-{variant}].md'
- Generate comprehensive type definitions with discriminated unions

Use the simplified `process-all` command to process this structure:

```bash
npm run process-all
```

This will:
1. Process all examples from the conventional directory structure
2. Generate snapshots for each directive
3. Create consolidated type definitions with discriminated unions
4. Generate E2E test fixtures when expected outputs are available
5. Produce documentation based on the examples

### Programmatic Usage

```typescript
import { Explorer } from 'meld-ast-explorer';

// Create an explorer instance with default configuration
const explorer = new Explorer();

// Or with custom configuration
const explorer = new Explorer({
  configPath: './custom-ast-explorer.config.json',
  outputDir: './generated',
  examplesDir: './core/examples',
  useMockParser: true
});

// Parse a directive
const ast = explorer.parseDirective('@text greeting = "Hello, world!"');
console.log(JSON.stringify(ast, null, 2));

// Generate types from a directive
explorer.generateTypes('@text greeting = "Hello, world!"', 'text-assignment');

// Process a batch of examples using JSON configuration
explorer.processBatch('./examples/directives.json');

// Process examples using convention-based directory structure
explorer.processExampleDirs('./core/examples');

// Generate consolidated types with discriminated unions
explorer.generateConsolidatedTypes();

// Run the complete convention-based workflow (examples + types + docs)
explorer.processAll();
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
  // Configuration file path
  configPath: './path/to/ast-explorer.config.json',

  // Individual path overrides
  outputDir: './generated',
  snapshotsDir: './generated/snapshots',
  typesDir: './generated/types',
  fixturesDir: './generated/fixtures',
  docsDir: './generated/docs',
  examplesDir: './examples',

  // Options
  useMockParser: false,

  // For testing
  fileSystem: customFileSystemAdapter
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
- `processExampleDirs(baseDir?: string): void` - Process examples from conventional directory structure
- `generateConsolidatedTypes(outputDir?: string): void` - Generate consolidated types with discriminated unions
- `processSnapshots(): void` - Process existing snapshots
- `generateDocs(): void` - Generate documentation
- `processAll(): void` - Run the complete workflow for convention-based processing

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