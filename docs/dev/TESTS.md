# Testing Documentation

This document describes the comprehensive testing approach for the Mlld project, including the fixture system, test organization, and different types of tests.

## Test Organization

### Recent Reorganization (December 2024)

The test structure was flattened to make valid tests the default case. Previously, valid tests were nested under `tests/cases/valid/`. Now they live at the root level of `tests/cases/`, with only special cases (exceptions, warnings, invalid) in subdirectories.

**Key changes:**
- Valid tests moved from `tests/cases/valid/*` → `tests/cases/*`
- Test fixture names now include variants (e.g., `slash/import/stdin-text` vs all being `slash/import/stdin`)
- Skip system changed from hardcoded list to file-based `skip.md` files

### Fixture System

The project uses an organized fixture system that automatically generates test fixtures from markdown examples. This approach ensures tests are maintainable and closely match real-world usage.

#### Directory Structure

```
tests/
├── cases/                    # Source test cases (markdown files)
│   ├── slash/               # Organized by directive type (valid tests)
│   │   ├── exe/            # /exe directive tests
│   │   ├── var/            # /var directive tests
│   │   ├── import/         # /import directive tests
│   │   └── ...             # Other directives
│   ├── feat/                # Feature-specific tests (valid tests)
│   │   └── ...             # Feature collections
│   ├── integration/         # Cross-feature integration tests
│   ├── docs/                # Auto-extracted documentation examples
│   ├── examples/            # Auto-copied from examples/ directory
│   ├── exceptions/          # Tests that should fail at runtime
│   ├── warnings/            # Tests that should produce warnings
│   └── invalid/             # Tests that should fail to parse
├── fixtures/                 # Generated test fixtures (JSON)
│   └── [mirrors cases/]     # Same structure as cases/
└── tokens/                   # Precision semantic token tests
```

#### Test Case Format

Each test case directory typically contains:
- `example.md` - The input Mlld content to test
- `expected.md` - The expected output (for valid tests only)
- Additional support files as needed

For tests with variants, use naming like:
- `example-multiline.md` / `expected-multiline.md`
- `example-with-variables.md` / `expected-with-variables.md`

### Creating Test Cases

#### File Placement
```bash
# Valid test that should succeed (default case, at root level)
tests/cases/slash/var/my-test/
  example.md      # Input mlld code
  expected.md     # Expected output
  data.json       # Support file (auto-copied)

# Test that should fail parsing
tests/cases/invalid/my-error/
  example.md      # Input that fails to parse
  error.md        # Expected error pattern

# Test that should fail at runtime
tests/cases/exceptions/my-exception/
  example.md      # Input that throws
  error.md        # Expected error pattern
```

#### Registering Test Files

Support files in test directories are automatically copied to the virtual filesystem root during test execution. For tests requiring specific file setups, register them in `interpreter/interpreter.fixture.test.ts`:

```typescript
// Auto-discovery: Files in test case directory are copied automatically
tests/cases/slash/import/alias/
  example.md
  expected.md
  alias-test-config.mld  # Auto-copied to /alias-test-config.mld
  alias-test-utils.mld   # Auto-copied to /alias-test-utils.mld

// Manual registration for complex setups (line ~760)
if (fixture.name === 'import-alias') {
  await fileSystem.writeFile('/config.mld', '/var @author = "Config Author"');
  await fileSystem.writeFile('/utils.mld', '/var @author = "Utils Author"');
}
```

**CRITICAL**: All test files must have unique names across the entire test suite. Files are copied to a single virtual filesystem root.

```bash
# BAD - Causes collisions
tests/cases/valid/import/all/config.mld
tests/cases/valid/import/namespace/config.mld

# GOOD - Unique names
tests/cases/slash/import/all/import-all-config.mld
tests/cases/slash/import/namespace/namespace-config.mld
```

### Skipping Tests

Tests can be skipped by placing a `skip.md` or `skip-*.md` file in the test directory. This is useful for:
- Tests requiring infrastructure not yet available
- Known issues being tracked
- Documentation examples that intentionally show invalid syntax
- Tests requiring manual verification

#### Skip File Naming Conventions

- `skip.md` - Generic skip file
- `skip-known-issue-NNN.md` - For tracked issues (e.g., `skip-known-issue-99.md`)
- `skip-manual.md` - Tests requiring manual verification or real filesystem
- `skip-doc-example.md` - Documentation examples with intentional errors
- `skip-future-enhancement.md` - Planned features not yet implemented
- `skip-needs-investigation.md` - Tests with unclear failures needing debugging

#### Skip File Format

The skip file should contain a brief explanation on the first line, followed by optional details:

```markdown
Brief description of why this test is skipped.

Additional details about the issue, tracking information,
or conditions under which this test could be re-enabled.
```

#### Example Skip Files

```bash
# For a known issue
tests/cases/integration/security/ttl-durations/skip-known-issue-99.md:
  "TTL/trust security features not yet implemented.

  Issue #99 tracks the implementation of these security features."

# For tests needing real filesystem
tests/cases/feat/alligator/glob-pattern/skip-manual.md:
  "Glob patterns require real filesystem access.

  These tests cannot run in the virtual filesystem environment."
```

When fixtures are built with `npm run build:fixtures`, skipped tests will show:
```
⏭️  Skipping integration/security/ttl-durations: skip-known-issue-99.md
```

### Test Types

#### 1. Valid Tests
Located in `tests/cases/` (at root level, organized in subdirectories like `slash/`, `feat/`, `integration/`). These tests:
- Should parse successfully
- Should execute without runtime errors
- Compare actual output against expected output
- Fail if output doesn't match exactly
- When a test exercises file effects (e.g., `/append`), read the generated files back via `<@root/...>` in the fixture so assertions cover both the output document and the filesystem side effects.

#### 2. Documentation Tests
Located in `tests/cases/docs/`. Automatically extracted from `docs/user/*.md`:
- **Syntax-only validation** - Parse but don't execute
- Extract via `scripts/extract-doc-tests.mjs` during `npm run build:fixtures`
- 140+ code blocks from documentation become test cases
- Tests marked as `(syntax only)` in output
- Catches outdated/invalid syntax without requiring complete context

#### 3. Smoke Tests
For examples without expected output (mainly in `examples/` directory):
- Verify the code parses successfully
- Verify execution doesn't crash
- Don't validate specific output content
- Generate actual output to `*-output.md` files for review

#### 3. Exception Tests
Located in `tests/cases/exceptions/`. These tests:
- May parse successfully
- Should fail during execution with specific error messages
- Include `error.md` file describing expected error
- Python exception fixtures under `tests/cases/exceptions/python/` require `python3`; the fixture runner skips them when `python3` is unavailable.

#### 4. Warning Tests
Located in `tests/cases/warnings/`. These tests:
- Should parse and execute successfully
- Should produce specific warning messages
- Include `warning.md` file describing expected warning

#### 5. Invalid Tests
Located in `tests/cases/invalid/`. These tests:
- Should fail to parse
- Test grammar edge cases and error conditions

#### 6. Checkpoint/Resume Coverage Strategy
- Keep low-level checkpoint correctness in focused unit tests under `tests/interpreter/checkpoint/` (`CheckpointManager` persistence, deterministic keys, corruption tolerance, invalidation, and fork overlay reads).
- Keep scenario-level behavior in fixture/integration cases under `tests/cases/integration/checkpoint/` for miss/hit semantics, resume targeting, fuzzy invalidation, and fork hit/miss overlays.
- For docs-published checkpoint/resume examples, generated syntax smoke fixtures are expected artifacts and should be committed with phase updates when regenerated.

## Fixture Generation

### Build Process

The fixture generation happens in two phases:

1. **Parse-time Generation** (`npm run build:fixtures`)
   - Processes all test cases in `tests/cases/`
   - Generates AST and validates syntax
   - Creates `.generated-fixture.json` files
   - Auto-copies examples from `examples/` directory

2. **Post-build Output Generation** (`npm run build:outputs`)
   - Runs after main TypeScript compilation
   - Executes examples without expected output
   - Generates `*-output.md` files in examples directory
   - Updates fixtures with actual output for reference

### Scripts

- `npm run build:fixtures` - Generate fixtures from test cases
- `npm run build:outputs` - Generate actual outputs for examples (cleans up after)
- `npm run build:outputs:keep` - Generate outputs and keep files for review
- `npm run build` - Full build including fixture and output generation

## Test Execution

### Running Tests

```bash
# Run all tests (excludes examples by default)
npm test

# Run specific test directory
npm test interpreter/

# Run specific test file
npm test interpreter/interpreter.fixture.test.ts

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Run examples (includes long-running LLM calls)
npm run test:examples

# Run semantic token precision tests
npm test tests/tokens/
```

**Note**: Examples are excluded from the default test run because they can include long-running LLM calls via `oneshot` commands. Use `npm run test:examples` to test examples specifically.

### Test Structure

The main test runner is in `interpreter/interpreter.fixture.test.ts`. It:

1. Recursively finds all `.generated-fixture.json` files
2. Sets up appropriate test environment for each fixture
3. Runs different test types based on fixture metadata:
   - **Valid tests**: Compare output to expected result + validate semantic token coverage
   - **Documentation tests**: Validate syntax only, skip execution (return after parse check)
   - **Smoke tests**: Verify execution doesn't crash + validate semantic token coverage
   - **Exception tests**: Verify specific errors are thrown
   - **Warning tests**: Verify warnings are produced
4. Validates semantic token coverage:
   - Every character must have a semantic token (except whitespace/commas)
   - Reports uncovered text with precise line/column locations
   - Tests fail if any mlld syntax lacks tokens

### Output Formatting in Tests

**Important**: The test runner disables prettier markdown formatting (`useMarkdownFormatter: false`) to ensure exact output matching. This means:

- Expected output files don't have prettier's automatic formatting (e.g., blank lines before headers)
- Tests verify the raw mlld output, not the prettified version
- This makes tests more stable and independent of prettier's formatting rules

In production use, mlld applies prettier formatting by default, which adds proper spacing, normalizes line breaks, and ensures consistent markdown formatting. Users can disable this with the `--no-format` flag.

### Environment Setup

Each test gets a clean environment with:
- Virtual file system (`MemoryFileSystem`)
- Path service for file resolution
- Shared test files copied from `tests/cases/files/`
- Example-specific files as needed
- Markdown formatter disabled for exact output matching
- Blank line normalization enabled (can be tested separately)

## Examples Integration

The `examples/` directory serves dual purposes:

1. **Documentation**: Real-world usage examples for users
2. **Testing**: Smoke tests to ensure examples stay functional

### Example Processing

- Examples are automatically copied to `tests/cases/examples/`
- Each `.mld` file becomes a test case
- Examples without `expected.md` files become smoke tests
- Actual output is generated to `*-output.md` files for review
- Output files can be renamed to `expected.md` to convert to full validation tests

### Converting Smoke Tests to Full Tests

To convert an example smoke test to a full validation test:

1. Review the generated `*-output.md` file
2. If the output is correct, rename it to `expected.md`
3. The fixture generator will pick up the expected output on next build
4. The test will become a full validation test instead of a smoke test

## Semantic Token Testing

mlld uses a dual-strategy approach for testing LSP semantic tokens (syntax highlighting):

### 1. Coverage Testing (Automatic)

All tests in `tests/cases/` can validate semantic token coverage when enabled with `MLLD_TOKEN_COVERAGE=1`. If any mlld syntax lacks tokens, tests fail with precise location info:

```bash
# Run tests with token coverage checking
MLLD_TOKEN_COVERAGE=1 npm test

# Example failure output:
Error: Semantic token coverage issues in when-exe-when-expressions:
  - UncoveredText at 6:18-6:27 " = when ["
  - UncoveredText at 7:1-7:38 "  @name == \"World\" => \"Hello, World!\""
```

### 2. Precision Testing (`tests/tokens/`)

Self-documenting `.mld` files test specific tokenization behavior.

Run precision tests: `npm test tests/tokens/`

### Semantic Token Test Example

```mlld
/var @name = 'Hello @world'
/var @greeting = `Hello @world`
/var @ops = @a && @b || !@c

=== START TOKENS ===
/var --> keyword
@name --> variable[declaration]
= --> operator
'Hello @world' --> string
/var --> keyword
@greeting --> variable[declaration]
= --> operator
`Hello ` --> string
@world --> variable
`` --> string
/var --> keyword
@ops --> variable[declaration]
= --> operator
@a --> variable
&& --> operator
@b --> variable
|| --> operator
! --> operator
@c --> variable
=== END TOKENS ===

=== START PARTIAL TOKENS ===
&& --> operator
|| --> operator
! --> operator
=== END PARTIAL TOKENS ===

=== START NOT TOKENS ===
@world --> interpolation    >> Single quotes don't interpolate
=== END NOT TOKENS ===
```

The test file can contain any combination of:
- `START TOKENS` - Exact match of all tokens in order
- `START PARTIAL TOKENS` - Match specific tokens anywhere in output
- `START NOT TOKENS` - Ensure these tokens are NOT generated

## Best Practices

### Writing Test Cases

1. **Use descriptive directory names** that clearly indicate what's being tested
2. **Keep examples minimal** but realistic
3. **Include edge cases** for grammar and execution
4. **Test error conditions** with exception and invalid test cases
5. **Document complex scenarios** with comments in test files

### Test File Naming Requirements

**CRITICAL**: All test support files (`.mld`, `.json`, etc.) must have unique names across the entire test suite. This is because the test runner copies all files to a single virtual filesystem root.

**❌ BAD - Generic names that cause collisions:**
```
tests/cases/slash/import/all/config.mld
tests/cases/slash/import/namespace/config.mld
tests/cases/integration/modules/config.mld
```

**✅ GOOD - Unique names prefixed with test context:**
```
tests/cases/slash/import/all/import-all-config.mld
tests/cases/slash/import/namespace/namespace-test-config.mld
tests/cases/integration/modules/modules-test-config.mld
```

**Why this matters**: When tests run, files from different test directories are copied to the same virtual filesystem. If multiple tests use `config.mld`, they will overwrite each other, causing tests to import the wrong files and fail with confusing errors.

### Maintaining Tests

1. **Run full build after changes** to regenerate fixtures
2. **Review generated output files** before committing
3. **Keep shared test files** in `tests/cases/files/` for reuse
4. **Update expected output** when behavior changes intentionally

### Debugging Tests

1. **Use `npm run ast`** to debug grammar issues
2. **Check fixture JSON files** to understand test setup
3. **Review actual vs expected output** in test failures
4. **Use `--verbose` flag** for detailed test output
5. **Debug semantic tokens** - Test failures show exact uncovered text ranges

## Integration with CI/CD

The test system integrates with continuous integration:

- All fixtures are generated during build
- Tests run on every commit
- Coverage reports are generated
- Both unit tests and integration tests are covered

This comprehensive testing approach ensures the Mlld language implementation is robust, well-tested, and maintains backward compatibility while supporting new features.
