# Missing Debug Infrastructure Dependency

## Issue

A critical dependency in the CLI debug infrastructure is missing: the `ContextDebuggerService.js` file. This file is referenced in `tests/utils/debug/StateDebuggerService/index.ts` but doesn't exist in the codebase, causing test failures and preventing the CLI from building correctly.

## Evidence

When running the CLI-related tests, the following error appears consistently:

```
Error: Failed to load url ./ContextDebuggerService.js (resolved id: ./ContextDebuggerService.js) in /Users/adam/dev/claude-meld/tests/utils/debug/StateDebuggerService/index.ts. Does the file exist?
```

This missing dependency is referenced in several places:

1. `tests/utils/debug/StateDebuggerService/index.ts`:
   ```typescript
   import { ContextDebuggerService } from './ContextDebuggerService.js';
   export function initializeContextDebugger(): ContextDebuggerService {...}
   export * from './ContextDebuggerService.js';
   ```

2. `cli/commands/debug-context.ts` depends on this service being available:
   ```typescript
   import { initializeContextDebugger } from '../../tests/utils/debug/index.js';
   // ...
   contextDebugger = initializeContextDebugger();
   // ...
   visualization = contextDebugger.visualizeContextHierarchy(...);
   ```

## Impact

1. CLI tests fail due to the missing dependency
2. The build process fails to generate the CLI binary due to this dependency issue
3. Debug commands (`meld debug-context`, `meld debug-transform`, etc.) cannot function

## Root Cause

The `ContextDebuggerService.js` file was likely intended to provide state visualization and debugging capabilities for the CLI, but was either:

1. Never implemented
2. Removed without updating references
3. Moved to a different location without updating imports

This is a core class for the debug infrastructure, as it should provide methods for visualizing state hierarchy, variable propagation, and resolution timelines that are referenced in the debug command implementations.

## Potential Solutions

1. **Create the missing file**: Implement a basic `ContextDebuggerService.ts` class that provides the methods expected by the debug commands:
   - `visualizeContextHierarchy`
   - `visualizeVariablePropagation`
   - `visualizeContextsAndVariableFlow`
   - `visualizeResolutionTimeline`

2. **Remove/disable debug functionality**: If debugging is not a critical part of the CLI for the initial release, consider:
   - Removing the debug command imports and implementations
   - Commenting out the debug-related code in `StateDebuggerService/index.ts`
   - Adding a TODO to implement this functionality in the future

3. **Refactor debug infrastructure**: Restructure the debug tools to avoid the dependency on the missing file.

## Implementation Approach

The fastest path to a working CLI is to implement a minimal version of `ContextDebuggerService.ts` that provides the expected API without necessarily implementing full visualization functionality. This would unblock the build process and allow the CLI to function, even if the debug commands return placeholder content.