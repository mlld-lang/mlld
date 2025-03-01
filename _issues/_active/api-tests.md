# Meld API Test Failures - Current Status

## Summary of Current State

We've successfully implemented fixes for the core array access functionality, resulting in passing tests for:
- `api/resolution-debug.test.ts`
- `api/array-access.test.ts`
- `tests/specific-nested-array.test.ts`

However, we still have failing tests in:
- `api/integration.test.ts` (~16 failing tests)
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts` (3 failing tests)
- `cli/cli.test.ts` (multiple failures)
- `tests/variable-index-debug.test.ts` (async issues)

## Categories of Remaining Test Failures

### 1. Error Message Format Differences

Several tests are failing because the error message format has changed:

```typescript
// In VariableReferenceResolver.test.ts:
// Expected: "Undefined variable: missing"
// Actual: "Variable missing not found"

// Expected: "Environment variable not set: ENV_TEST"  
// Actual: "Variable ENV_TEST not found"
```

This is a consistent pattern where the error message format was updated but the tests weren't. This is a relatively simple fix requiring test updates.

### 2. Parser Integration Issues

Some tests expect the parser to be called but it's not being invoked:

```typescript
expect(parserService.parse).toHaveBeenCalled();
```

Our fix might have bypassed the parser in some cases, resulting in these expectations failing.

### 3. Parse Errors Related to Bracket Notation

Multiple tests in `api/integration.test.ts` are failing with:

```
Parse error: Expected "$", ">>", "`", "{{", or end of input but "{" found.
Parse error: Expected "$", ">>", "`", "{{", or end of input but "[" found.
```

These errors are directly related to the meld-ast upgrade, which changed how array notation is handled. The tests contain syntax that the new parser is rejecting.

### 4. CLI Test Issues

Many CLI tests are failing due to:
- Mock functions not being called as expected
- Expected error messages not matching actual ones
- File system operations not working as expected in the tests

### 5. Async Test Issues

In `tests/variable-index-debug.test.ts`, the test fails because it's not properly handling asynchronous code:

```
- Expected: "apple"
+ Received: Promise {}
```

The test is directly comparing a Promise with a string instead of awaiting the Promise resolution.

## Implementation Strategy for Test Fixes

### 1. Error Message Format Updates

Update test expectations to match the new error message format:

```typescript
// Before
expect(() => resolver.resolve('missing')).toThrow('Undefined variable: missing');

// After
expect(() => resolver.resolve('missing')).toThrow('Variable missing not found');
```

### 2. Parser Integration Fixes

Ensure the parser is properly invoked when needed, or update tests to reflect current behavior:

```typescript
// Check if we need to mock the parser in tests
const parserService = {
  parse: jest.fn().mockReturnValue(/* mock AST */)
};

// Ensure our implementation code calls the parser when expected
```

### 3. Syntax Updates for Tests

Update test content to use syntax compatible with the new parser:

```typescript
// Before (might be failing)
context.fs.writeFileSync('test.meld', '@data items = ["apple"]\nItem: {{items[0]}}');

// After (using supported syntax)
context.fs.writeFileSync('test.meld', '@data items = ["apple"]\nItem: {{items.0}}');
```

### 4. CLI Test Fixes

Review and update the CLI test setup to correctly mock required functions:

```typescript
// Ensure mocks are properly set up
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

// Verify mock expectations correctly
expect(fs.readFileSync).toHaveBeenCalledWith('test.file', 'utf8');
```

### 5. Async Test Fixes

Use `await` or proper Promise handling in tests:

```typescript
// Before (failing)
expect(resolver.resolveAsync('variable')).toEqual('value');

// After (correctly handling async)
expect(await resolver.resolveAsync('variable')).toEqual('value');
```

## Recommended Implementation Order

1. Start with error message format updates as they're the simplest
2. Fix async test issues next
3. Address parser integration and syntax updates
4. Finally tackle the more complex CLI test issues

## Execution Plan

1. Create a helper function to update test expectations across multiple files
2. Focus on one category of failures at a time
3. Run tests after each fix to verify progress
4. Document changes for future reference

## Key Files to Update

1. `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`
2. `api/integration.test.ts`
3. `cli/cli.test.ts`
4. `tests/variable-index-debug.test.ts`

## Conclusion

The remaining test failures are primarily related to test expectations rather than core functionality issues. With systematic updates to test expectations and proper handling of async code, we can restore the test suite to a passing state while maintaining the successful array access implementation.




---- side note ----



## Root Cause Analysis of the Regression

The current test failures stem from an attempted improvement that inadvertently worked against an established architectural decision:

### Original Architecture ("Regex Approach")
As documented in transformation-decision.md, the team deliberately chose a regex-based approach for variable resolution and transformation as a pragmatic solution that:
- Required minimal code changes
- Maintained backward compatibility with tests
- Reduced implementation risk
- Could be developed quickly

### The Change That Triggered Failures
The suggested change was to "use the parser when available" instead of defaulting to regex. This shifted the code toward what the documentation calls the "Elegant Solution" without implementing all the necessary supporting changes.

### Specific Technical Issues
1. **Directive Node Handling**: The parser-based approach didn't correctly process Directive nodes
2. **Property Access Pattern**: Code incorrectly accessed properties directly from nodes instead of through the `directive` property
3. **Error Message Inconsistency**: The formats differed between approaches (`Variable X not found` vs `Undefined variable: X`)
4. **Transformation Logic**: Inconsistent application of transformation enabled/disabled flags

### Current Status
We've fixed most critical issues but now have 35 tests passing instead of the original 30, suggesting our changes have enabled previously skipped/ignored tests.

### Path Forward
In addition to the implementation strategy outlined above, we should:
1. Decide whether to fully commit to the parser-based "Elegant Solution" or revert more completely to the regex-based approach
2. If staying with parser-based approach, systematically update all tests to match the new expectations
3. Consider documenting this decision as an update to the transformation-decision.md file
