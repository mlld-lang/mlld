# Testing Documentation

This document describes the comprehensive testing approach for the Mlld project, including the fixture system, test organization, and different types of tests.

## Test Organization

### Fixture System

The project uses an organized fixture system that automatically generates test fixtures from markdown examples. This approach ensures tests are maintainable and closely match real-world usage.

#### Directory Structure

```
tests/
├── cases/                    # Source test cases (markdown files)
│   ├── valid/               # Tests that should parse and execute successfully
│   │   ├── examples/        # Auto-copied from examples/ directory
│   │   ├── add/            # Add directive tests
│   │   ├── data/           # Data directive tests
│   │   ├── exec/           # Exec directive tests
│   │   ├── import/         # Import directive tests
│   │   ├── path/           # Path directive tests
│   │   ├── run/            # Run directive tests
│   │   └── text/           # Text directive tests
│   ├── exceptions/          # Tests that should fail at runtime
│   ├── warnings/           # Tests that should produce warnings
│   └── invalid/            # Tests that should fail to parse
├── fixtures/                # Generated test fixtures (JSON)
│   ├── valid/              # Generated from valid/ test cases
│   ├── exceptions/         # Generated from exceptions/ test cases
│   ├── warnings/           # Generated from warnings/ test cases
│   └── invalid/            # Generated from invalid/ test cases
└── utils/                  # Test utilities and helpers
```

#### Test Case Format

Each test case directory typically contains:
- `example.md` - The input Mlld content to test
- `expected.md` - The expected output (for valid tests only)
- Additional support files as needed

For tests with variants, use naming like:
- `example-multiline.md` / `expected-multiline.md`
- `example-with-variables.md` / `expected-with-variables.md`

### Test Types

#### 1. Valid Tests
Located in `tests/cases/valid/`. These tests:
- Should parse successfully
- Should execute without runtime errors
- Compare actual output against expected output
- Fail if output doesn't match exactly

#### 2. Smoke Tests
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

#### 4. Warning Tests
Located in `tests/cases/warnings/`. These tests:
- Should parse and execute successfully
- Should produce specific warning messages
- Include `warning.md` file describing expected warning

#### 5. Invalid Tests
Located in `tests/cases/invalid/`. These tests:
- Should fail to parse
- Test grammar edge cases and error conditions

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
```

**Note**: Examples are excluded from the default test run because they can include long-running LLM calls via `oneshot` commands. Use `npm run test:examples` to test examples specifically.

### Test Structure

The main test runner is in `interpreter/interpreter.fixture.test.ts`. It:

1. Recursively finds all `.generated-fixture.json` files
2. Sets up appropriate test environment for each fixture
3. Runs different test types based on fixture metadata:
   - **Valid tests**: Compare output to expected result
   - **Smoke tests**: Verify execution doesn't crash
   - **Exception tests**: Verify specific errors are thrown
   - **Warning tests**: Verify warnings are produced

### Environment Setup

Each test gets a clean environment with:
- Virtual file system (`MemoryFileSystem`)
- Path service for file resolution
- Shared test files copied from `tests/cases/files/`
- Example-specific files as needed

## Examples Integration

The `examples/` directory serves dual purposes:

1. **Documentation**: Real-world usage examples for users
2. **Testing**: Smoke tests to ensure examples stay functional

### Example Processing

- Examples are automatically copied to `tests/cases/valid/examples/`
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

## Best Practices

### Writing Test Cases

1. **Use descriptive directory names** that clearly indicate what's being tested
2. **Keep examples minimal** but realistic
3. **Include edge cases** for grammar and execution
4. **Test error conditions** with exception and invalid test cases
5. **Document complex scenarios** with comments in test files

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

## Integration with CI/CD

The test system integrates with continuous integration:

- All fixtures are generated during build
- Tests run on every commit
- Coverage reports are generated
- Both unit tests and integration tests are covered

This comprehensive testing approach ensures the Mlld language implementation is robust, well-tested, and maintains backward compatibility while supporting new features.