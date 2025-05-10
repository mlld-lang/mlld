# Using the AST Explorer

The AST Explorer is a tool for analyzing and working with the Meld grammar's Abstract Syntax Tree (AST). This guide covers common usage patterns for exploring, generating TypeScript types, creating test fixtures, and automating workflows.

## Quick Start

The AST Explorer is accessible via npm scripts in the root `package.json`:

```bash
# Explore a directive's AST structure
npm run ast:explore -- '@text greeting = "Hello, world!"'

# Extract directives from a Meld file
npm run ast:extract -- ./examples/example.meld

# Generate TypeScript types from a directive
npm run ast:types -- '@text greeting = "Hello, world!"' -n text-greeting

# Generate a test fixture
npm run ast:fixture -- '@text greeting = "Hello, world!"' -n text-greeting-test

# Generate AST snapshots
npm run ast:snapshot -- '@text greeting = "Hello, world!"' -n text-greeting

# Compare with an existing snapshot
npm run ast:compare -- '@text greeting = "Hello, world!"' text-greeting

# Run batch processing
npm run ast:batch -- ./examples/directives.json

# Run the full workflow (process examples, generate types and docs)
npm run ast:workflow
```

## Configuration

The AST Explorer uses a configuration file to determine where to find examples and where to output generated files. The default config file is located at `ast-explorer.config.json` in the project root.

You can specify a custom configuration file with:

```bash
npm run ast:workflow -- -c ./path/to/custom-config.json
```

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

## Common Tasks

### Analyzing Directives

To explore the structure of a directive:

```bash
npm run ast:explore -- '@text greeting = "Hello, world!"'
```

This will output the AST in JSON format to the console. To save to a file:

```bash
npm run ast:explore -- '@text greeting = "Hello, world!"' -o ./output.json
```

### Generating TypeScript Types

To generate TypeScript interfaces from a directive:

```bash
npm run ast:types -- '@text greeting = "Hello, world!"' -n TextGreeting -o ./types/text-greeting.ts
```

### Creating Test Fixtures

Test fixtures are useful for testing parsers and transformers:

```bash
npm run ast:fixture -- '@text greeting = "Hello, world!"' -n text-greeting-test
```

This generates a test fixture in `./core/ast/generated/fixtures/text-greeting-test.ts` (or the path specified in your config).

### Batch Processing

You can process multiple examples at once using a JSON configuration file:

```bash
npm run ast:batch -- ./examples/directives.json
```

Example JSON structure:

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

### Full Workflow

The workflow command automates the entire exploration process:

```bash
npm run ast:workflow
```

This will:
1. Process examples from the configured directories
2. Generate consolidated TypeScript types
3. Generate documentation

## Programmatic Usage

You can also use the AST Explorer programmatically in your tests or scripts:

```typescript
import { Explorer } from 'meld-ast-explorer';

// Create explorer with default config
const explorer = new Explorer();

// Or with custom options
const explorer = new Explorer({
  outputDir: './generated',
  useMockParser: true
});

// Parse a directive
const ast = explorer.parseDirective('@text greeting = "Hello, world!"');
console.log(JSON.stringify(ast, null, 2));

// Generate types
explorer.generateTypes('@text greeting = "Hello, world!"', 'TextGreeting');

// Process a batch of examples
explorer.processBatch('./examples/directives.json');
```

## Filesystem Adapters for Testing

The AST Explorer comes with a filesystem adapter pattern to support testing:

```typescript
import { Explorer, MemfsAdapter } from 'meld-ast-explorer';

// Create a memfs adapter for testing
const memfs = new MemfsAdapter();

// Create explorer with memfs adapter
const explorer = new Explorer({
  fileSystem: memfs
});

// Now all file operations will be performed in memory
explorer.generateTypes('@text greeting = "Hello, world!"', 'TextGreeting');
```

This is especially useful for unit and integration tests where you don't want to touch the real filesystem.