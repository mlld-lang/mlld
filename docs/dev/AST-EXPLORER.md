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

# Process examples using a convention-based directory structure
npm run ast:process-all -- -d ./core/examples -o ./core/generated

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

### Convention-Based Directory Structure

The AST Explorer supports a convention-based approach for organizing examples, which is recommended for most use cases. This approach uses a consistent directory structure instead of a configuration file:

```
core/examples/
├── directivekind/             # e.g., text, run, import
│   └── directivesubtype/      # e.g., assignment, template
│       ├── example.md         # Base example
│       ├── expected.md        # Expected output for base example
│       ├── example-variant.md # Variant example (e.g., multiline)
│       └── expected-variant.md # Expected output for variant
```

This structure provides several advantages:
- Organizes examples by directive kind and subtype
- Supports variant examples with the naming pattern 'example-{variant}.md'
- Associates expected outputs with the naming pattern 'expected[-{variant}].md'
- Generates comprehensive type definitions with discriminated unions
- Creates E2E test fixtures automatically when expected outputs are provided

Use the simplified `ast:process-all` command to process this structure:

```bash
npm run ast:process-all
```

This will:
1. Process all examples from the convention-based directory structure
2. Generate AST snapshots for each directive
3. Create consolidated type definitions with discriminated unions
4. Generate E2E test fixtures when expected outputs are available
5. Produce documentation based on the examples

### Using Generated Artifacts

The AST Explorer generates various artifacts based on the configuration:

1. **TypeScript Types**: Found in `./core/ast/generated/types/`
   - Use these to understand the structure of different directive types
   - Import them in test files for type checking
   - Includes discriminated unions when using convention-based structure

2. **Test Fixtures**: Found in `./core/ast/generated/fixtures/`
   - Use these as inputs for tests that need AST nodes

3. **E2E Fixtures**: Found in `./core/ast/generated/fixtures/`
   - Full end-to-end test fixtures with input and expected output
   - Automatically created from example/expected pairs in the convention-based structure

4. **AST Snapshots**: Found in `./core/ast/generated/snapshots/`
   - Use these for regression testing (comparing current AST to previous versions)

5. **Documentation**: Found in `./core/ast/generated/docs/`
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

1. **Convention-Based Organization**: The explorer uses a standardized directory structure for examples, making it easy to organize examples by directive kind and subtype.

2. **FileSystem Abstraction**: The explorer uses a filesystem adapter pattern to enable testing without touching the real filesystem.

3. **Configuration System**: A unified configuration approach that supports both CLI options and configuration files.

4. **AST Parser Integration**: The explorer connects with the Meld grammar parser to generate AST nodes.

5. **Discriminated Union Type Generation**: When using the convention-based approach, the explorer generates comprehensive type definitions with discriminated unions based on directive kind.

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

### Using the Convention-Based Approach

To organize examples using the recommended convention-based approach:

```bash
# Create conventional directory structure
mkdir -p core/examples/text/assignment
mkdir -p core/examples/text/template
mkdir -p core/examples/run/command

# Add example files
echo '@text greeting = "Hello, world!"' > core/examples/text/assignment/example.md
echo 'Hello, world!' > core/examples/text/assignment/expected.md
echo '@text multiline = "Hello,\nworld!"' > core/examples/text/assignment/example-multiline.md
echo 'Hello,\nworld!' > core/examples/text/assignment/expected-multiline.md
echo '@text template = [[Template with {{var}}]]' > core/examples/text/template/example.md
echo '@run echo "Testing"' > core/examples/run/command/example.md

# Process all examples
npm run ast:process-all

# Check the generated files
ls -la ./core/generated/types
ls -la ./core/generated/snapshots
ls -la ./core/generated/fixtures
```

This will:
- Generate AST snapshots for all examples
- Create consolidated type definitions with discriminated unions by directive kind
- Generate E2E test fixtures for examples with expected outputs
- Produce documentation for each directive subtype

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