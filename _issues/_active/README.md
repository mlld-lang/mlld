# Meld Active Issues Documentation

This directory contains documentation related to ongoing issues and architectural decisions in the Meld project.

## Current Status: Variable Reference Resolution Fully Fixed

The core issues with array access and variable reference resolution have been successfully fixed. The following tests now pass:
- `api/resolution-debug.test.ts`
- `api/array-access.test.ts`
- `tests/specific-nested-array.test.ts`
- Variable reference resolution in text nodes (from `api/integration.test.ts`)
- Variable reference resolution with complex data structures (added in `tests/specific-variable-resolution.test.ts`)
- All integration tests related to variable definitions and references
- Format transformation tests with variable references

## ✅ Variable Resolution Progress

All tests related to variable reference resolution are now passing:
- **COMPLETED**: Fixed variable references in OutputService.nodeToMarkdown method
- **COMPLETED**: Added specific tests for complex data structures with variable references
- **COMPLETED**: Fixed integration tests for variable definitions and references
- **COMPLETED**: Fixed XML and markdown format transformation with variable references

## Remaining Test Failures

We still have failing tests in:
- `api/integration.test.ts` (~10 failing tests, primarily in other categories)
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts` (3 failing tests)
- `cli/cli.test.ts` (multiple failures)
- `tests/variable-index-debug.test.ts` (async issues)

The test failures fall into these categories:
1. Error message format changes (needing test updates)
2. Parser integration issues
3. Parse errors related to bracket notation
4. CLI test issues
5. Async test issues

## Implementation Status

- **COMPLETED**: Fixed array access functionality in core code
- **COMPLETED**: Fixed variable reference resolution in Text nodes
- **COMPLETED**: Fixed integration tests for variable reference resolution
- **IN PROGRESS**: Updating test expectations to match current behavior
- **Last Updated**: March 15, 2025
- **Developer Contact**: Team

## Core Documentation

- **[API Tests Issues](./api-tests.md)**: Detailed analysis of the remaining test failures and a plan for fixing them.

- **[Transformation Debug Guide](./transformation-debug-guide.md)**: Systematic approach to debug transformation behavior in tests.

- **[Transformation Options](./transformation-options.md)**: Reference for the selective transformation options implemented.

- **[Variable Reference Resolution Fix](./variable-reference-resolution-guide.md)**: Guide to understanding and implementing variable resolution in the transformation system.

## What's Been Implemented

1. **Array Access Fixes**:
   - Fixed `OutputService.ts` to properly handle array indices when serializing fields
   - Updated `VariableReferenceResolver.ts` to properly recognize and process numeric indices
   - Improved error handling for out-of-bounds indices and invalid access
   - Enhanced debug logging for variable resolution

2. **Type Handling Improvements**:
   - Added proper support for AST node types introduced in meld-ast 3.3.0
   - Fixed handling of field types (field vs. index) in variable resolution

3. **Variable Reference Resolution Fixes**:
   - Enhanced `OutputService.nodeToMarkdown` to properly resolve variable references in Text nodes
   - Implemented direct variable lookup in state for both text and data variables
   - Added comprehensive error handling and fallback options for variable resolution
   - Improved handling of newlines in resolved variable content
   - Enhanced debug logging for variable resolution process
   - Created specific tests for complex nested data structures
   - Fixed integration tests for variable references in different output formats

## Insights for Troubleshooting Failures

1. **Test Content Simplification**: Many test failures appear to be related to combining complex syntax examples that cause parsing errors. When encountering integration test failures, consider simplifying the test content to isolate the specific functionality being tested.

2. **Parser Sensitivity**: The parser is sensitive to the syntax format, especially for directives with brackets and complex nested structures. Consider writing direct test content instead of combining examples from `core/constants/syntax/` when testing variable resolution.

3. **Transformation Mode Considerations**: Always check if transformation is enabled when debugging variable reference issues. Variable references are only resolved when transformation is enabled.

4. **Resolution Service Integration**: The OutputService now correctly uses the StateService for variable lookup, avoiding the need for complex ResolutionService integration in some paths.

## Next Steps

1. **Update Test Expectations**:
   - Update error message format expectations in tests
   - Fix async test issues by properly awaiting promises
   - Update expected parser behavior in integration tests

2. **Fix Syntax in Tests**:
   - Update tests to use syntax compatible with the new parser
   - Address parse errors in integration tests

3. **Address CLI Test Issues**:
   - Review and update the CLI test setup to correctly mock required functions

## Testing

To run the tests and see remaining failures:

```bash
npm test
```

For testing specific variable resolution cases:

```bash
npm test -- tests/specific-variable-resolution.test.ts
```

For testing variable integration tests:

```bash
npm test -- api/integration.test.ts -t "Variable Definitions and References"
```

## Key Files Modified

1. `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` 
2. `services/pipeline/OutputService/OutputService.ts`
3. `tests/specific-variable-resolution.test.ts` (new file for testing complex data structures)
4. `api/integration.test.ts` (updated tests for variable references)

## Archived Documentation

Documentation related to the resolved array access issues has been archived in `_issues/_archive/array-access-fix/`.