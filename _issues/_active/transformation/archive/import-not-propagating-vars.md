# Debug Findings: Import Directive in Transformation Mode

## Issue Summary

The `ImportDirectiveHandler` is not correctly propagating variables from imported files when transformation mode is enabled. This affects several tests in `api/integration.test.ts` related to import handling.

## Detailed Analysis

### Symptoms

1. In `api/integration.test.ts`, the test "should handle simple imports" fails because the imported variable `importedVar` is not found in the state.
2. The test "should handle nested imports with proper scope inheritance" fails because variables from nested imports are not being resolved.
3. The test "should detect circular imports" fails because circular imports are not being detected in transformation mode.

### Root Cause

The issue appears to be in the `ImportDirectiveHandler.ts` implementation. When transformation is enabled, the handler correctly replaces the import directive with an empty text node, but it's not properly propagating the variables from the imported state to the parent state.

Specifically, in the `execute` method of `ImportDirectiveHandler`, there's a conditional branch for transformation mode:

```typescript
// Check if transformation is enabled
if (targetState.isTransformationEnabled && targetState.isTransformationEnabled()) {
  // Replace the directive with empty content
  const replacement: TextNode = {
    type: 'Text',
    content: '',
    location: node.location ? {
      start: node.location.start,
      end: node.location.end
    } : undefined
  };

  return {
    state: targetState,
    replacement
  };
} else {
  // If parent state exists, copy all variables back to it
  if (context.parentState) {
    // Copy all text variables from the imported state to the parent state
    const textVars = targetState.getAllTextVars();
    textVars.forEach((value, key) => {
      if (context.parentState) {
        context.parentState.setTextVar(key, value);
      }
    });
    
    // ... similar code for other variable types ...
  }
  
  // Log the import operation
  logger.debug('Import complete', {
    path: resolvedFullPath,
    imports,
    targetState
  });
  
  return targetState;
}
```

The issue is that when transformation is enabled, the code returns early without copying the variables from the imported state to the parent state. This means that while the directive is correctly transformed into an empty text node, the variables from the imported file are not available in the parent state.

### Verification

I ran the transformation test for `ImportDirectiveHandler` and it passes, but it's not actually testing whether the variables are correctly propagated. It only tests that the directive is replaced with an empty text node.

The integration tests that specifically check for variable propagation are failing, confirming this issue.

## Attempted Solutions and Findings

### Initial Fix Attempt

We implemented a fix by modifying the `ImportDirectiveHandler.execute` method to ensure variables are copied from the imported state to the parent state even when transformation is enabled:

```typescript
// Check if transformation is enabled
if (targetState.isTransformationEnabled && targetState.isTransformationEnabled()) {
  // Replace the directive with empty content
  const replacement: TextNode = {
    type: 'Text',
    content: '',
    location: node.location ? {
      start: node.location.start,
      end: node.location.end
    } : undefined
  };

  // IMPORTANT: Copy variables from imported state to parent state
  // even in transformation mode
  if (context.parentState) {
    // Copy all text variables from the imported state to the parent state
    const textVars = targetState.getAllTextVars();
    textVars.forEach((value, key) => {
      if (context.parentState) {
        context.parentState.setTextVar(key, value);
      }
    });
    
    // ... similar code for other variable types ...
  }

  return {
    state: targetState,
    replacement
  };
} else {
  // Existing code for non-transformation mode
  // ...
}
```

However, after implementing this fix, the tests were still failing. This suggests there might be additional issues beyond just copying variables from the imported state to the parent state.

### Debugging Tool Challenges

We attempted to use the built-in debugging tools to get more insight into the variable resolution process:

1. We tried to use the `debug-resolution` command to track variable resolution, but encountered issues with the command not being properly set up for direct execution:
   ```
   Error: Cannot find module '/Users/adam/dev/meld/cli/debug-resolution.js'
   ```

2. We attempted to run the command through the CLI entry point:
   ```
   npx ts-node cli/index.ts debug-resolution api/integration.test.ts --var importedVar
   ```
   But encountered module resolution errors:
   ```
   Error: Cannot find module '@core/di-config.js'
   ```

3. We tried running the command through npm scripts, but there was no debug script available:
   ```
   npm error Missing script: "debug"
   ```

These challenges highlight that the debugging tools, while potentially powerful, require proper setup and integration with the codebase.

### Additional Insights

1. The transformation tests for `ImportDirectiveHandler` pass because they're only testing that the directive is replaced with an empty text node, not that variables are correctly propagated.

2. The issue might be more complex than just copying variables from the imported state to the parent state. It could involve:
   - How the `StateService` handles transformation mode
   - How variable resolution works across state boundaries in transformation mode
   - How the `InterpreterService` processes transformed nodes

3. The circular import detection issue in transformation mode suggests that the transformation process might be bypassing some critical checks in the import process.

## Next Steps for Debugging

1. **Debug the Debug Tools**: Fix the integration of debug tools with tests and CLI to enable deeper investigation.

2. **Investigate State Boundaries**: Examine how state boundaries are handled during transformation, particularly for nested imports.

3. **Trace Variable Resolution**: Use the `VariableResolutionTracker` (once working) to trace exactly where variable resolution is breaking down.

4. **Review Transformation Logic**: Look more deeply at how transformation affects the entire pipeline, not just the `ImportDirectiveHandler`.

5. **Enhance Test Coverage**: Add tests that specifically verify variable propagation in transformation mode.

## Proposed Solution

The solution is to modify the `ImportDirectiveHandler.execute` method to ensure that variables are copied from the imported state to the parent state even when transformation is enabled.

Here's the proposed fix:

```typescript
// Check if transformation is enabled
if (targetState.isTransformationEnabled && targetState.isTransformationEnabled()) {
  // Replace the directive with empty content
  const replacement: TextNode = {
    type: 'Text',
    content: '',
    location: node.location ? {
      start: node.location.start,
      end: node.location.end
    } : undefined
  };

  // IMPORTANT: Copy variables from imported state to parent state
  // even in transformation mode
  if (context.parentState) {
    // Copy all text variables from the imported state to the parent state
    const textVars = targetState.getAllTextVars();
    textVars.forEach((value, key) => {
      if (context.parentState) {
        context.parentState.setTextVar(key, value);
      }
    });
    
    // ... similar code for other variable types ...
  }

  return {
    state: targetState,
    replacement
  };
} else {
  // Existing code for non-transformation mode
  // ...
}
```

This ensures that variables are properly propagated regardless of whether transformation is enabled.

## Additional Considerations

1. The circular import detection should also be fixed to work in transformation mode.
2. The tests should be updated to verify that variables are correctly propagated in transformation mode.
3. The `StateService` implementation should be reviewed to ensure that it correctly handles variable propagation in transformation mode.

## Debugging Tools Used

- Examined the code in `ImportDirectiveHandler.ts` to understand how it handles imports in transformation mode
- Ran the transformation test for `ImportDirectiveHandler` to verify that it passes
- Ran the integration tests for import handling to confirm the issue
- Analyzed the `StateService` implementation to understand how it handles transformation
- Attempted to use the `debug-resolution` command but encountered setup issues

## Next Steps

1. Fix the debug tools integration to enable deeper investigation
2. Implement the proposed fix in `ImportDirectiveHandler.ts` and address any additional issues
3. Add tests to verify that variables are correctly propagated in transformation mode
4. Update the documentation to clarify how transformation mode affects variable propagation 

## Import Not Propagating Variables in Transformation Mode

## Issue Summary
When using the `@import` directive in transformation mode, variables from the imported file are not being properly propagated to the parent state. This causes tests to fail when they expect imported variables to be available.

## Symptoms
- Tests in `api/integration.test.ts` fail with errors like "Variable importedVar not found"
- The `ImportDirectiveHandler` transformation tests pass but don't verify variable propagation
- Nested imports fail to resolve variables from deeper imports

## Root Cause Analysis
The issue appears to be in the `ImportDirectiveHandler.execute` method. When transformation mode is enabled, the handler is not properly copying variables from the imported state to the parent state.

The transformation mode path in the `execute` method likely has a bug in how it handles variable propagation across state boundaries. The handler creates a child state for the import, but when in transformation mode, it may not be correctly merging the variables back to the parent state.

```typescript
// In ImportDirectiveHandler.execute
if (context.state.isTransformationEnabled()) {
  // This code path may not be correctly propagating variables
  // from the child state back to the parent state
}
```

## Attempted Solutions

### Initial Fix Attempt
Attempted to modify the `ImportDirectiveHandler.execute` method to ensure variables are copied from the imported state to the parent state:

```typescript
// Potential fix in ImportDirectiveHandler.execute
if (context.state.isTransformationEnabled()) {
  // After processing the import in the child state
  // Copy variables from child state to parent state
  const childTextVars = childState.getAllTextVars();
  for (const [key, value] of childTextVars.entries()) {
    context.state.setTextVar(key, value);
  }
  
  // Also copy data variables
  const childDataVars = childState.getAllDataVars();
  for (const [key, value] of childDataVars.entries()) {
    context.state.setDataVar(key, value);
  }
}
```

However, tests continued to fail, indicating there may be additional issues with how state boundaries are handled during transformation.

### Debug Tools Integration Issues

Attempted to use the debug tools to trace variable resolution, but encountered several issues:

1. **Missing Module Error**: When trying to run the debug-resolution CLI command:
   ```
   npx ts-node cli/index.ts debug-resolution api/integration.test.ts --var importedVar
   ```
   Received error: `Error: Cannot find module '@tests/utils/debug/VariableResolutionTracker'`

2. **Missing enableResolutionTracking Method**: The `debug-resolution.ts` command tries to call `enableResolutionTracking()` on the ResolutionService, but this method doesn't appear to be implemented in the current codebase.

3. **Debug Script Not Available**: There's no "debug" script in package.json to run the debug tools.

4. **Test Skipping**: When running tests with `--grep import`, many tests are skipped, indicating potential configuration issues.

The debug tools appear to be partially implemented but not fully integrated with the codebase. The `ResolutionService` doesn't have the `enableResolutionTracking` method that the CLI command expects, and the required modules aren't properly exported or available.

## Next Steps

1. **Fix Debug Tools Integration**:
   - Implement the missing `enableResolutionTracking` method in `ResolutionService`
   - Ensure the `VariableResolutionTracker` module is properly exported and available
   - Add a "debug" script to package.json for easier access to debug tools

2. **Investigate State Boundaries During Transformation**:
   - Once debug tools are working, trace how variables are passed across state boundaries
   - Focus on the transformation mode path in `ImportDirectiveHandler.execute`

3. **Trace Variable Resolution**:
   - Use the debug tools to trace the resolution of `importedVar` in the failing tests
   - Identify exactly where the variable is lost during the import process

4. **Review Transformation Logic**:
   - Compare how variables are handled in normal mode vs. transformation mode
   - Check if there are any special considerations for transformation mode that are missing

5. **Enhance Test Coverage**:
   - Add tests that specifically verify variable propagation in transformation mode
   - Ensure tests cover both direct imports and nested imports

## Impact
This issue affects a core feature of Meld - the ability to import variables from other files. Fixing it will ensure that imports work correctly in all modes, improving the reliability of the system.

## Debug Tools Status

The debug tools appear to be designed but not fully implemented or integrated. Key issues include:

1. **Missing Implementation**: The `ResolutionService` doesn't have the `enableResolutionTracking` method that the CLI command expects.

2. **Module Path Issues**: The debug tools modules aren't properly exported or available at the paths the CLI commands expect.

3. **Integration Gaps**: The CLI commands are implemented but can't access the necessary services or methods.

4. **Documentation vs. Reality Gap**: The documentation in `DEBUG.md` describes a comprehensive debugging system, but many parts aren't fully implemented or integrated.

Fixing the debug tools integration would significantly enhance our ability to diagnose and fix the variable propagation issue, as well as other similar issues in the future. 