# Debug Commands Implementation Issues

## Issue

The CLI includes several debug commands (`debug-context`, `debug-resolution`, `debug-transform`) that have implementation issues. These commands are critical for diagnosing and resolving problems with Meld transformation and resolution processes, but they fail to function properly due to missing dependencies and incomplete implementations.

## Evidence

1. When running tests for these commands, they fail with errors:
   ```
   FAIL  cli/commands/debug-context.test.ts
   FAIL  cli/commands/debug-transform.test.ts
   ```

2. The debug commands depend on utilities that aren't fully implemented:
   ```typescript
   // From debug-context.ts
   contextDebugger = initializeContextDebugger();
   // ...
   visualization = contextDebugger.visualizeContextHierarchy(...);
   ```

3. Debug visualization methods referenced in the code aren't defined in the `ContextDebuggerService` (which is missing entirely):
   - `visualizeContextHierarchy`
   - `visualizeVariablePropagation` 
   - `visualizeContextsAndVariableFlow`
   - `visualizeResolutionTimeline`

## Impact

1. Users can't use the CLI debug commands to diagnose issues with their Meld files
2. Developers lack critical tools for resolving variable resolution and transformation issues
3. The CLI is missing core functionality that is advertised in its help message

## Root Cause

1. **Missing Debug Service**: The `ContextDebuggerService` class is missing entirely, but it's referenced in multiple places.

2. **Incomplete Implementation**: The debug command implementations expect visualization functions that don't exist.

3. **Test Dependencies**: The tests for these commands depend on mocked versions of services that don't align with the current implementation.

## Detailed Analysis

### Debug Context Command

This command is designed to visualize state hierarchies and variable propagation through the Meld execution pipeline. It requires the `ContextDebuggerService` to provide visualization methods like `visualizeContextHierarchy` and `visualizeVariablePropagation`.

### Debug Resolution Command

This command helps diagnose variable resolution issues by tracking how variables are processed through the resolution chain. It depends on a properly configured resolution tracking system.

### Debug Transform Command

This command visualizes how nodes are transformed through the pipeline, which is essential for understanding transformation bugs. It depends on transformation tracking functionality that may not be fully implemented.

## Potential Solutions

1. **Implement Missing Classes**: Develop the `ContextDebuggerService` with minimal implementations of the required methods.

2. **Simplify Debug Commands**: Reduce the scope of debug commands to work with existing infrastructure while omitting advanced visualization features.

3. **Add Error Handling**: Enhance the commands to gracefully handle missing services or methods and provide useful fallback information.

## Implementation Approach

1. **Short Term**: Create a minimal `ContextDebuggerService` implementation that allows the CLI to build, even if the debug functionality is limited.

2. **Medium Term**: Enhance the debug commands to handle missing functionality gracefully, with informative error messages.

3. **Long Term**: Fully implement the visualization and debugging infrastructure to provide comprehensive debugging tools.

The immediate priority should be implementing just enough of the debug infrastructure to allow the CLI to build and function, even if the debug commands only provide placeholders or simple diagnostics.