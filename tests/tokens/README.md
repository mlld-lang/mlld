# Token Edge Case Tests

This directory contains precision tests for semantic token generation in the mlld language server. These tests verify exact token types and positions for syntax highlighting in editors.

## Why Separate Tests?

These tests are excluded from the main test suite (`npm test`) because:

1. **They test editor-specific behavior** - The tests verify exact token positions and types for VSCode syntax highlighting, which is not core language functionality.

2. **They are brittle by design** - These tests must match exact character positions and token types, making them sensitive to any AST or grammar changes.

3. **They can conflict with language evolution** - As noted in the codebase, trying to make these tests pass has sometimes caused regressions in actual syntax highlighting.

4. **They test edge cases** - Many of these tests cover complex or unusual syntax patterns that may not represent typical mlld usage.

## Running Token Tests

```bash
# Run all token tests
npm run test:tokens

# Run token tests in watch mode
npm run test:tokens:watch

# Run a specific token test file
npm run test:tokens -- tests/tokens/pipes/variable-pipe-transforms.mld
```

## Test Structure

Each `.mld` file in this directory and subdirectories represents a test case:

```mlld
# Test input code
/var @example = "value"

=== TOKENS ===
"@example" --> variable[declaration]
"=" --> operator
"\"value\"" --> string
```

The test file contains:
- The mlld code to test
- A `=== TOKENS ===` separator
- Expected tokens in the format: `"text" --> tokenType[modifiers]`

## Adding New Tests

1. Create a new `.mld` file in the appropriate subdirectory
2. Write the mlld code you want to test
3. Add the `=== TOKENS ===` separator
4. List the expected tokens in order

## Known Issues

Some token patterns have known issues that are tracked in GitHub:
- Issue #328: Even-numbered pipes in /var directives don't highlight correctly
- Issue #332: Arrays and objects with mlld values have inconsistent highlighting

See `missing-highlights.md` in the project root for a full list of known highlighting issues.