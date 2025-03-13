# Special Handling in Import Directive Tests

## Workaround Location and Code

In `api/integration.test.ts`, there are multiple instances of temporary fixes for import directive handling:

1. Around lines 1160-1170:
```typescript
// TEMPORARY FIX - this should be fixed properly in the ImportDirectiveHandler
context.services.state.setTextVar('greeting', 'Hello');
expect(context.services.state.getTextVar('greeting')).toBe('Hello');

// TEMPORARY FIX - The actual result doesn't contain the resolved variable
// Instead of expecting "Content from import: Hello", we'll just check that
// the import directive was removed and transformed into something else
console.log('Final result:', result);
//expect(result).toContain('Content from import: Hello');
expect(result).toContain('Content from import');
```

2. Around lines 1250-1256:
```typescript
// Set the variables directly for now to make the test pass
// TEMPORARY FIX - should be fixed properly in the ImportDirectiveHandler
console.log('Setting level2 and level3 variables directly');
context.services.state.setTextVar('level2', 'Level 2 imported');
context.services.state.setTextVar('level3', 'Level 3 imported');
```

## Purpose of the Workarounds

These workarounds artificially set variable values directly in the state service during tests, bypassing the normal import directive resolution process. This is done to make the tests pass despite underlying issues with the ImportDirectiveHandler's variable resolution in nested imports.

The core issues appear to be:

1. Variables from imported files are not being properly transferred to the parent state
2. Variable resolution within imported content isn't working correctly
3. Nested imports (imports within imports) may not be handling variable scope properly

## Affected Tests

### 1. tests/api/integration.test.ts - "should handle import directive transformation"

This test verifies that an `@import` directive:
- Is properly transformed/removed from output
- Transfers variables from the imported file to the parent state
- Resolves variables within the imported content

The test is currently bypassing the actual import mechanism by manually setting state variables.

### 2. tests/api/integration.test.ts - "should handle nested import directive transformation" 

This test verifies that nested imports work correctly, with variables from multiple levels of imports being available in the parent state. Again, it's bypassing the actual import mechanism by manually setting state variables.

## Root Cause Analysis

The underlying issue appears to be with the ImportDirectiveHandler's handling of:

1. **Variable Scope**: Variables defined in imported files may not be correctly added to the parent state scope
2. **Variable Resolution**: Variable references in imported content may not be properly resolved
3. **Transformation Mode**: The import directive transformation may not be fully integrating with the variable resolution system

## Current Status

This is a significant issue affecting a core feature of the codebase:

1. The workarounds are masking failures in the import directive handling system
2. Tests are passing because of manual state manipulation rather than correct functionality
3. The temporary fixes are explicitly labeled as such, indicating awareness of the need for a proper fix

## Recommendations

1. **Fix ImportDirectiveHandler**: Thoroughly review and fix the ImportDirectiveHandler's variable resolution and state management logic.

2. **Improve State Inheritance**: Ensure that variables from imported files are correctly added to the parent state.

3. **Enhance Transformation Mode**: Verify that import directive transformation correctly handles variable resolution.

4. **Add Regression Tests**: Create comprehensive tests for import variable resolution, state inheritance, and nested imports without workarounds.

5. **Document Implementation**: Once fixed, document the correct state inheritance behavior for imports.

## Implementation Concerns

The fix will need to consider:

1. **State Scoping**: The relationship between parent and child states during imports
2. **Variable Resolution Timing**: When variables are resolved during the import process
3. **Transformation Mode**: How transformation affects the variable resolution process
4. **Nested Imports**: How state is managed across multiple levels of imports

## Next Steps

1. Review the ImportDirectiveHandler implementation to understand the current variable handling logic
2. Create minimal test cases that demonstrate the issues without workarounds
3. Fix the underlying issues in the ImportDirectiveHandler
4. Remove the temporary workarounds and ensure tests pass with proper functionality 