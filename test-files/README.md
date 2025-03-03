# Meld Debug Test Files

This directory contains test files for debugging Meld functionality.

## Test Files

- `debug-test.meld`: Original test file with standard import syntax
- `debug-test-fixed.meld`: Fixed test file with array-style import syntax
- `debug-imported.meld`: A file that is imported by the test files

## Debug Commands

The following npm scripts are available for debugging:

### For the original test file:

```bash
# Debug variable resolution
npm run debug:test-file

# Debug context and variable propagation
npm run debug:test-context

# Debug imported file
npm run debug:test-import
```

### For the fixed test file:

```bash
# Debug variable resolution
npm run debug:test-fixed

# Debug context and variable propagation
npm run debug:test-fixed-context

# Debug node transformations
npm run debug:test-fixed-transform
```

## Import Syntax

The Meld parser expects import paths to be wrapped in square brackets:

```
# Correct syntax
@import ["./path/to/file.meld"]

# Incorrect syntax
@import "./path/to/file.meld"
```

## Troubleshooting

If you encounter issues with the debug commands:

1. Make sure you've built the project with `npm run build`
2. Check that the test files exist in the correct location
3. Verify that the import syntax is correct (using square brackets)
4. If using paths with slashes, they must either be URLs or use special variables

## Adding New Test Files

When adding new test files, make sure to:

1. Use the correct import syntax with square brackets
2. Add appropriate npm scripts to package.json for debugging
3. Update this README with information about the new files 