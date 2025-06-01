# Local Development Guide

This guide covers how to set up and work with mlld locally during development.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/mlld-lang/mlld.git
cd mlld

# Install dependencies
npm install

# Build the project
npm run build

# Install locally with branch-based naming
npm run reinstall
```

## Local Installation with Custom Names

The `reinstall` scripts allow you to install mlld locally with custom command names, making it easy to test different versions side-by-side.

### Basic Usage

```bash
# Install as mlld-<current-git-branch>
# For example, on branch 'rc' this creates 'mlld-rc'
npm run reinstall

# Install with a custom alias
npm run reinstall -- mytest
# Creates command: mlld-mytest

# Remove all mlld-* installations
npm run reinstall:clean

# Remove a specific installation
npm run reinstall:clean -- mytest
# Removes only: mlld-mytest
```

### How It Works

1. **Symlink-based**: Creates symlinks in your global npm bin directory
2. **No package.json changes**: Doesn't modify the project's package.json
3. **Metadata tracking**: Stores installation info in `.mlld-local-installs.json` (gitignored)
4. **Branch awareness**: Automatically uses sanitized git branch names

### Examples

```bash
# Working on a feature branch
git checkout feature/new-parser
npm run reinstall
# Now you can use: mlld-feature-new-parser

# Testing multiple versions
git checkout main
npm run reinstall -- stable
git checkout develop  
npm run reinstall -- dev
# Now you have both: mlld-stable and mlld-dev

# Clean up after testing
npm run reinstall:clean
# Removes all mlld-* commands
```

## Development Workflow

### 1. Making Changes

```bash
# Make your code changes
vim interpreter/core/interpreter.ts

# Rebuild and reinstall
npm run build
npm run reinstall

# Test your changes
mlld-<branch> examples/demo.mld
```

### 2. Running Tests

```bash
# Run all tests
npm test

# Run specific test directory
npm test interpreter

# Run specific test file
npm test interpreter/interpreter.fixture.test.ts

# Watch mode for TDD
npm run test:watch

# Include example tests
npm run test:examples
```

### 3. Working with the Grammar

```bash
# After modifying grammar files
npm run build:grammar

# Test grammar changes with AST viewer
npm run ast -- '@text greeting = "hello"'

# Debug grammar parsing
npm run ast:debug -- '@import { * } from "./config.mld"'
```

### 4. Debugging Tips

```bash
# Use verbose output
mlld-<branch> --verbose examples/demo.mld

# Check file resolution
mlld-<branch> --show-paths examples/imports.mld

# Test error formatting
mlld-<branch> examples/invalid.mld
```

## Common Scenarios

### Testing Registry Features

```bash
# Work on registry branch
git checkout feature/registry
npm run reinstall -- registry

# Test registry imports
echo '@import { utils } from "mlld:utils@1.0.0"' > test-registry.mld
mlld-registry test-registry.mld
```

### Comparing Versions

```bash
# Install current version
npm run reinstall -- current

# Switch to another branch
git checkout experiment
npm run reinstall -- experiment

# Compare outputs
mlld-current examples/complex.mld > output-current.md
mlld-experiment examples/complex.mld > output-experiment.md
diff output-current.md output-experiment.md
```

### CI/CD Testing Locally

```bash
# Simulate CI environment
npm run build:grammar
npm run build
npm test

# Test distribution package
npm pack
# Creates mlld-*.tgz that you can test elsewhere
```

## Troubleshooting

### Command Not Found

If `mlld-<name>` is not found after installation:

1. Check your npm global bin directory is in PATH:
   ```bash
   echo $PATH | grep -q "$(npm bin -g)" || echo "Not in PATH"
   ```

2. Verify the symlink exists:
   ```bash
   ls -la $(npm bin -g)/mlld-*
   ```

### Build Errors

If you encounter build errors:

1. Clean and rebuild:
   ```bash
   npm run clean
   npm run build:grammar
   npm run build
   ```

2. Check for generated files:
   ```bash
   # These should exist after build:grammar
   ls grammar/parser/parser.js
   ls grammar/generated/
   ```

### Stale Installations

If installations seem outdated:

1. Check metadata:
   ```bash
   cat .mlld-local-installs.json
   ```

2. Force clean and reinstall:
   ```bash
   npm run reinstall:clean
   npm run build
   npm run reinstall
   ```

## Best Practices

1. **Use descriptive aliases**: When working on features, use meaningful names
   ```bash
   npm run reinstall -- error-handling-fix
   ```

2. **Clean up regularly**: Remove old installations you're not using
   ```bash
   npm run reinstall:clean -- old-experiment
   ```

3. **Document version-specific behavior**: If testing multiple versions, keep notes
   ```bash
   # Create a test script that documents version differences
   echo "mlld-main examples/test.mld > main-output.md" > compare-versions.sh
   echo "mlld-feature examples/test.mld > feature-output.md" >> compare-versions.sh
   ```

4. **Use branch naming conventions**: This makes the automatic branch-based naming more useful
   - `feature/parser-update` → `mlld-feature-parser-update`
   - `fix/memory-leak` → `mlld-fix-memory-leak`
   - `experiment/new-syntax` → `mlld-experiment-new-syntax`

## Advanced Usage

### Custom Wrapper Scripts

You can create custom wrapper scripts that use specific installations:

```bash
#!/bin/bash
# save as: test-with-versions.sh

echo "Testing with stable version:"
mlld-stable "$@"

echo -e "\nTesting with experimental version:"
mlld-experimental "$@"
```

### Integration with Editor

Configure your editor to use a specific version:

```json
// VS Code settings.json
{
  "mlld.executablePath": "/usr/local/bin/mlld-development"
}
```

### Parallel Development

Work on multiple features simultaneously:

```bash
# Terminal 1: Parser work
git checkout feature/parser
npm run reinstall -- parser
# Make changes, test with mlld-parser

# Terminal 2: Error handling
git checkout feature/errors  
npm run reinstall -- errors
# Make changes, test with mlld-errors

# Compare behaviors
mlld-parser problematic-file.mld
mlld-errors problematic-file.mld
```

## See Also

- [MODULES.md](./MODULES.md) - Understanding the module system
- [TESTS.md](./TESTS.md) - Comprehensive testing guide
- [AST.md](./AST.md) - Working with the Abstract Syntax Tree
- [ERRORS.md](./ERRORS.md) - Error handling system