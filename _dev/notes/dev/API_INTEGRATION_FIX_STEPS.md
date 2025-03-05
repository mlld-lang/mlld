# API Integration Test Fix: Implementation Steps

This document outlines the specific steps to fix each failing test group in the API integration tests.

## 1. Continue Path Directive Fixes

- [x] Update `PathDirectiveValidator` to accept both `id` and `identifier`
- [x] Update `PathDirectiveValidator` to extract path from `path.raw`
- [x] Update `PathDirectiveHandler` to handle both property formats
- [ ] Fix remaining `getPathVar` issue:
  - Look at `PathResolver.ts` and ensure it properly handles path variables
  - Check if `stateService` is properly referenced and initialized

## 2. Fix Import Directive Handling

- [x] Create AST debugger tool to analyze directive structure:
  ```bash
  # Run for any directive type
  ./scripts/run-ast-debugger.sh import
  ```
- [ ] Update `ImportDirectiveValidator` to handle both formats:
  - Check for value as string or object with `path` property
  - Accept `path` property or direct value
- [ ] Update `ImportDirectiveHandler` to extract paths from various formats
- [ ] Fix test expectations to match actual error formats

## 3. Fix Define Directive Handling

- [ ] Use AST debugger to analyze Define directive structure:
  ```bash
  ./scripts/run-ast-debugger.sh define
  ```
- [ ] Update `DefineDirectiveValidator` to accept:
  - Both `id` and `identifier` properties
  - Various command formats
  - Nested parameter structures
- [ ] Update `DefineDirectiveHandler` to extract values from all formats
- [ ] Fix command execution value extraction in tests

## 4. Fix Embed Directive Handling

- [ ] Use AST debugger to analyze Embed directive structure:
  ```bash
  ./scripts/run-ast-debugger.sh embed
  ```
- [ ] Update `EmbedDirectiveValidator` to accept:
  - Both path string and path object formats
  - Section extraction formats
- [ ] Update `EmbedDirectiveHandler` to extract paths and sections correctly
- [ ] Fix test fixture files for embed tests if needed

## 5. Fix TextVar Node Processing

- [ ] Use AST debugger to analyze TextVar node structure:
  ```bash
  ./scripts/run-ast-debugger.sh textvar
  ```
- [ ] Investigate interpreter error for "Unknown node type: TextVar"
- [ ] Add support for TextVar nodes in interpreter if missing
- [ ] Fix transformation pipeline for variable references

## 6. Fix Code Fence Tests

- [ ] Use AST debugger to analyze Code Fence structure:
  ```bash
  ./scripts/run-ast-debugger.sh codefence
  ```
- [ ] Update code fence test fixtures with proper escaping:
  - Use triple backticks instead of raw backticks
  - Check if YAML escaping is needed
- [ ] Fix nested code fence expected outputs
- [ ] Ensure proper code fence block creation

## 7. Verification Steps

For each fix:

1. Run the specific test group to verify the fix:
   ```bash
   npm test api/integration.test.ts -- -t "Import Handling"
   ```

2. Run all integration tests to check for regressions:
   ```bash
   npm test api/integration.test.ts
   ```

3. Run all API tests to ensure nothing breaks:
   ```bash
   npm test api
   ```

## Next Steps After All Tests Pass

1. Refactor any duplicate code into shared utilities
2. Create documentation for AST node structures
3. Add comments explaining the dual property support
4. Create regression tests for any edge cases found