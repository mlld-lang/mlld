# AST Explorer

The AST Explorer is a tool for working with and analyzing Meld's Abstract Syntax Tree. It's designed to help developers understand the structure of the AST, generate TypeScript types from examples, and create test fixtures.

## Overview

The AST Explorer is structured as a standalone module in `lib/ast-explorer`, with its own:
- Command-line interface
- TypeScript configuration
- Tests
- Documentation

It's integrated with the main Meld codebase through npm scripts in the root `package.json`.

## Using the AST Explorer

### Command-Line Usage

The most common way to use the AST Explorer is through the npm scripts defined in the root `package.json`:

```bash
# View the AST for a directive
npm run ast:explore -- '@text greeting = "Hello, world!"'

# Extract directives from a Meld file
npm run ast:extract -- ./examples/example.meld

# Generate TypeScript types from a directive
npm run ast:types -- '@text greeting = "Hello, world!"' -n text-greeting

# Generate a test fixture
npm run ast:fixture -- '@text greeting = "Hello, world!"' -n text-greeting-test

# Generate AST snapshots for regression testing
npm run ast:snapshot -- '@text greeting = "Hello, world!"' -n text-greeting

# Compare a directive with an existing snapshot
npm run ast:compare -- '@text greeting = "Hello, world!"' text-greeting

# Process multiple examples from a JSON file
npm run ast:batch -- ./examples/directives.json

# Run the full workflow (process examples, generate types and docs)
npm run ast:workflow
```

### Configuration

The AST Explorer is configured via `ast-explorer.config.json` in the project root:

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

You can provide an alternative configuration file with the `-c` option:

```bash
npm run ast:workflow -- -c ./path/to/custom-config.json
```

### Using Generated Artifacts

The AST Explorer generates various artifacts based on the configuration:

1. **TypeScript Types**: Found in `./core/ast/generated/types/`
   - Use these to understand the structure of different directive types
   - Import them in test files for type checking

2. **Test Fixtures**: Found in `./core/ast/generated/fixtures/`
   - Use these as inputs for tests that need AST nodes

3. **AST Snapshots**: Found in `./core/ast/generated/snapshots/`
   - Use these for regression testing (comparing current AST to previous versions)

4. **Documentation**: Found in `./core/ast/generated/docs/`
   - Auto-generated documentation based on AST structure

## Development

The AST Explorer uses a modular approach with filesystem abstraction for testing:

### Architecture

```
lib/ast-explorer/
├── bin/                   # Command-line executables
│   └── ast-explorer.js
├── src/
│   ├── index.ts           # Main entry point
│   ├── config.ts          # Configuration system
│   ├── parse.ts           # Parser adapter
│   ├── explorer.ts        # Main Explorer class
│   ├── command.ts         # CLI command handlers
│   ├── generate/          # Generation utilities
│   │   ├── types.ts       # TypeScript type generation
│   │   ├── fixtures.ts    # Test fixture generation
│   │   ├── snapshots.ts   # AST snapshot generation
│   │   └── docs.ts        # Documentation generation
├── tests/                 # Test files
```

### Key Concepts

1. **FileSystem Abstraction**: The explorer uses a filesystem adapter pattern to enable testing without touching the real filesystem.

2. **Configuration System**: A unified configuration approach that supports both CLI options and configuration files.

3. **AST Parser Integration**: The explorer connects with the Meld grammar parser to generate AST nodes.

### Running Tests

```bash
cd lib/ast-explorer
npm test
```

### Building the Explorer

```bash
npm run ast:build
```

## When to Use the AST Explorer

The AST Explorer is particularly useful in these scenarios:

1. **Learning the AST Structure**: When you need to understand how different directives are represented in the AST

2. **Developing New Directives**: To see how your grammar changes affect the AST structure

3. **Debugging Parser Issues**: To isolate and reproduce parsing problems

4. **Generating Types**: To automatically create TypeScript types from example directives

5. **Creating Test Fixtures**: To generate test fixtures for parser and transformation tests

## Test Strategy with Memfs

The AST Explorer uses [memfs](https://github.com/streamich/memfs) for testing file operations without touching the real filesystem:

```typescript
import { setupTestFileSystem } from './utils/FsManager';
import { Explorer } from '../src/explorer';

it('should generate files correctly', async () => {
  // Setup test filesystem
  const { fsAdapter, cleanup } = setupTestFileSystem();
  
  // Create explorer with test adapter
  const explorer = new Explorer({ fileSystem: fsAdapter });
  
  // Test operations...
  
  // Always clean up
  await cleanup();
});
```

## Examples

### Generating TypeScript Types for a New Directive

Let's say you've added a new directive syntax to the grammar and want to generate TypeScript types for it:

```bash
# Generate types for a new directive
npm run ast:types -- '@newdirective options = { enabled: true, mode: "advanced" }' -n new-directive-type

# Check the generated type
cat ./core/ast/generated/types/new-directive-type.ts
```

### Creating Test Fixtures for Parser Tests

If you're writing tests for the parser and need AST fixtures:

```bash
# Generate a test fixture
npm run ast:fixture -- '@text template = [[Template with {{var}}]]' -n text-template-test

# Use it in your tests
import { textTemplateTest } from '../../core/ast/generated/fixtures/text-template-test';
```

### Comparing AST Structure Between Versions

If you're making grammar changes and want to ensure backward compatibility:

```bash
# Create a snapshot before changes
npm run ast:snapshot -- '@text greeting = "Hello, world!"' -n text-greeting-before

# Make your changes, then compare
npm run ast:compare -- '@text greeting = "Hello, world!"' text-greeting-before
```

## Resources

For more details on the AST structure, refer to these resources:

- [MELD-AST.md](./MELD-AST.md) - Overview of the AST structure
- [AST.md](./AST.md) - Additional details on AST implementation
- [AST-EXPLORER-USAGE.md](/AST-EXPLORER-USAGE.md) - Detailed usage guide

## Contributing to the AST Explorer

See [CONTRIBUTING.md](/lib/ast-explorer/CONTRIBUTING.md) for details on contributing to the AST Explorer itself.