# Meld Active Issues Documentation

This directory contains documentation related to ongoing issues and architectural decisions in the Meld project.

## Current Status: Array Access and Variable Resolution Issues Fixed

The core issues with array access and variable reference resolution have been successfully fixed. The following tests now pass:
- `api/resolution-debug.test.ts`
- `api/array-access.test.ts`
- `tests/specific-nested-array.test.ts`
- Variable reference resolution in text nodes (from `api/integration.test.ts`)

## Remaining Test Failures

We still have failing tests in:
- `api/integration.test.ts` (~15 failing tests)
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
- **IN PROGRESS**: Updating test expectations to match current behavior
- **Last Updated**: March 12, 2025
- **Developer Contact**: Team

## Core Documentation

- **[API Tests Issues](./api-tests.md)**: Detailed analysis of the remaining test failures and a plan for fixing them.

- **[Transformation Debug Guide](./transformation-debug-guide.md)**: Systematic approach to debug transformation behavior in tests.

- **[Transformation Options](./transformation-options.md)**: Reference for the selective transformation options implemented.

- **[Variable Reference Resolution Fix](./variable-reference-resolution-fix.md)**: Guide to understanding and implementing variable resolution in the transformation system.

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

For debugging specific tests with detailed logging:

```bash
DEBUG=meld:resolution npm test -- api/resolution-debug.test.ts
```

For testing variable resolution specifically:

```bash
npm test -- api/integration.test.ts -t "should handle text variable definitions and references"
```

## Key Files Modified

1. `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` 
2. `services/pipeline/OutputService/OutputService.ts`

## Archived Documentation

Documentation related to the resolved array access issues has been archived in `_issues/_archive/array-access-fix/`.