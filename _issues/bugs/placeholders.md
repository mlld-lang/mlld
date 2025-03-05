# Issue: Embed Directives Not Transforming When Transformation Mode Enabled

## Summary
When running Meld with transformation mode enabled (`MELD_TRANSFORM=true`), embed directives are not being properly transformed and still appear as placeholders in the output.

## Observations

### Transformation Mode Setup
- Transformation mode is correctly enabled when `MELD_TRANSFORM=true` environment variable is set
- In `api/index.ts`, the code checks for this environment variable and sets `options.transformation = true`
- The state service appears to be initialized with transformation enabled
- The transformed nodes array is being initialized

### Debug Logging Issues
- Added debug logging is being swallowed/not appearing in both stdout and stderr
- Attempts to use `console.log`, `console.error`, and `process.stderr.write` didn't produce visible output
- This suggests a custom logging system might be intercepting or redirecting outputs

### Embed Directive Behavior
- Embed directives are identified and processed through the transformation pipeline
- The `EmbedDirectiveHandler.execute()` method returns a transformation result with:
  ```typescript
  return {
    state: newState,
    replacement: {
      type: 'Text',
      content, // The embedded content
      location: node.location
    } as TextNode
  };
  ```
- However, the replacement nodes don't appear to be properly applied in the transformed nodes array

### OutputService Behavior
- The `OutputService.convert()` method correctly checks for transformation mode
- When transformation is enabled, it uses `state.getTransformedNodes()` instead of original nodes
- The `nodeToMarkdown()` method checks for embed directives and searches transformed nodes
- But it's not finding transformed versions of embed directives, falling back to placeholders

### Variable Copying Mechanism
- The codebase includes a `StateVariableCopier` utility specifically designed for copying variables between states
- The `EmbedDirectiveHandler` implements variable copying in its execute method:
  ```typescript
  // If in transformation mode (parentState exists), copy variables to parent state
  if (context.parentState) {
    try {
      // Get all variables from the child state
      const textVars = childState.getAllTextVars?.() || {};
      const dataVars = childState.getAllDataVars?.() || {};
      const pathVars = childState.getAllPathVars?.() || {};
      const commandVars = childState.getAllCommands?.() || {};
      
      // Copy each variable type to parent state
      Object.entries(textVars).forEach(([name, value]) => {
        context.parentState!.setTextVar(name, value);
      });
      
      // Copy other variable types...
    } catch (error) {
      // Log but don't throw
    }
  }
  ```
- This suggests variable copying is important for proper transformation behavior

### Comparison with RunDirectiveHandler
- The `RunDirectiveHandler` correctly transforms and returns command outputs in transformation mode
- Key differences from `EmbedDirectiveHandler`:
  ```typescript
  // In transformation mode, return a replacement node with the command output
  if (clonedState.isTransformationEnabled()) {
    const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr || '';
    const replacement: TextNode = {
      type: 'Text',
      content,
      location: node.location
    };
    
    // Copy variables from cloned state to context state
    if (node.directive.output) {
      context.state.setTextVar(node.directive.output, stdout);
    } else {
      context.state.setTextVar('stdout', stdout);
    }
    if (stderr) {
      context.state.setTextVar('stderr', stderr);
    }
    
    clonedState.transformNode(node, replacement);
    return { state: clonedState, replacement };
  }
  ```
- The key difference is that `RunDirectiveHandler` explicitly calls `clonedState.transformNode(node, replacement)` before returning

### ImportDirectiveHandler Historical Issues
- Similar issues were previously identified with `ImportDirectiveHandler` where variables weren't properly propagated in transformation mode
- The fix involved ensuring variable copying even in transformation mode:
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
      
      // Copy other variable types...
    }

    return {
      state: targetState,
      replacement
    };
  }
  ```

### InterpreterService Behavior
- The `InterpreterService` does apply transformation for directive results:
  ```typescript
  // If transformation is enabled and we have a replacement node,
  // we need to apply it to the transformed nodes
  if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
    logger.debug('Applying replacement node from directive handler', {
      originalType: node.type,
      replacementType: replacement.type,
      directiveKind: directiveNode.directive.kind
    });
    
    // Apply the transformation by replacing the directive node with the replacement
    try {
      // Ensure we have the transformed nodes array initialized
      if (!currentState.getTransformedNodes || !currentState.getTransformedNodes()) {
        // Initialize transformed nodes if needed
        const originalNodes = currentState.getNodes();
        if (originalNodes && currentState.setTransformedNodes) {
          currentState.setTransformedNodes([...originalNodes]);
          logger.debug('Initialized transformed nodes array', {
            nodesCount: originalNodes.length
          });
        }
      }
      
      // Apply the transformation
      currentState.transformNode(node, replacement as MeldNode);
      
    } catch (transformError) {
      logger.error('Error applying transformation', {
        error: transformError,
        directiveKind: directiveNode.directive.kind
      });
      // Continue execution despite transformation error
    }
  }
  ```

- However, `InterpreterService` also has special handling for import directives that may not apply to embed directives:
  ```typescript
  // Special handling for imports in transformation mode:
  // Copy all variables from the imported file to the original state
  if (isImportDirective && 
      currentState.isTransformationEnabled && 
      currentState.isTransformationEnabled()) {
    try {
      logger.debug('Import directive in transformation mode, copying variables to original state');
      
      // Use the state variable copier utility to copy all variables
      this.stateVariableCopier.copyAllVariables(currentState, originalState, {
        skipExisting: false,
        trackContextBoundary: false, // No tracking service in the interpreter
        trackVariableCrossing: false
      });
    } catch (e) {
      logger.debug('Error copying variables from import to original state', { error: e });
    }
  }
  ```

### Transformation Flow Issue
There appears to be a disconnect in the transformation process:
1. `EmbedDirectiveHandler` creates replacement nodes
2. These nodes should be added to the transformed nodes array via `StateService.transformNode()`
3. The `OutputService` should find these transformed nodes and render them
4. But the chain is breaking down somewhere in steps 2-3

## Debug Tools Attempted
- Added direct debug logging to key methods across multiple services
- Used environment variables to enable transformation and debug modes
- Rebuilt the application to incorporate changes
- Tried redirecting stdout/stderr to separate files for analysis
- Created a simplified test file to isolate the issue

## Root Cause Analysis

After comparing the `RunDirectiveHandler` with the `EmbedDirectiveHandler` and examining the `InterpreterService` handling, we've identified several contributing factors:

1. **Different execution patterns**: The `RunDirectiveHandler` explicitly calls `clonedState.transformNode(node, replacement)` before returning, while the `EmbedDirectiveHandler` does not.

2. **Reliance on InterpreterService transformation**: The `EmbedDirectiveHandler` appears to rely on the `InterpreterService` to handle the transformation after it returns a result with a replacement node.

3. **Possible state mutation issue**: There may be an issue with how the state is being cloned or updated in the `InterpreterService` that is causing the replacement to be lost or not properly applied.

4. **Special handling for imports but not embeds**: The `InterpreterService` has special logic for `ImportDirectiveHandler` that might be needed for `EmbedDirectiveHandler` as well.

5. **Location matching failure**: The `OutputService` tries to find the transformed node by matching location, which could be failing if the locations are different:
   ```typescript
   const transformed = transformedNodes.find(n => 
     n.location?.start.line === node.location?.start.line
   );
   ```

6. **Path resolution in tests**: We encountered unexpected path validation issues in our tests. The test environment enforces strict path validation requiring specific prefixes:
   - Tests fail with: "Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH"
   - Attempted fixes changing from `@embed [$./embedded.md]` to `@embed [$PROJECTPATH/embedded.md]` didn't resolve the issues
   - This could be a file existence issue - we may need to reference the existing embedded.md in tests/test-files/ instead
   - The TestContext file system may need specific initialization for these test files

7. **Direct console.log usage**: We found direct `console.log` statements in the code instead of proper logger calls, creating noisy output and potentially complicating debug efforts.

## Attempted Solutions and Findings

We've attempted several fixes to address this issue:

### 1. Replace console.log with proper logger

```typescript
// In transformation mode, register the replacement
if (newState.isTransformationEnabled()) {
  // Apply the transformation to the node
  this.logger.debug('Registering transformation for embed directive', {
    nodeLocation: node.location,
    transformEnabled: newState.isTransformationEnabled(),
    contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
  });
  newState.transformNode(node, replacement);
}
```

### 2. Enhanced node matching in OutputService

Improved the algorithm to handle cases where node positions shift:

```typescript
// First try by exact line match
const transformed = transformedNodes.find(n => 
  n.location?.start.line === node.location?.start.line
);

// If found by line match and it's a Text node, use it
if (transformed && transformed.type === 'Text') {
  logger.debug('Found transformed node by line match', {
    nodeType: transformed.type,
    nodeLocation: transformed.location,
    content: (transformed as TextNode).content?.substring(0, 50)
  });
  const content = (transformed as TextNode).content;
  return content.endsWith('\n') ? content : content + '\n';
}

// If not found by line match, try a broader search
// This handles cases where line numbers might have shifted
for (const t of transformedNodes) {
  if (t.type === 'Text' && node.location && t.location) {
    // Look for nodes with content that are within 5 lines of the original
    if (Math.abs(t.location.start.line - node.location.start.line) <= 5) {
      const content = (t as TextNode).content;
      return content.endsWith('\n') ? content : content + '\n';
    }
  }
}
```

While these changes improved the code quality, they did not fully resolve the issue. We encountered unexpected path validation errors in our tests that prevented us from verifying the effectiveness of these changes. 

## Confirmation of Core Issue

We've confirmed a key part of the issue through direct testing:

1. **File not found errors are clear**: When a file doesn't exist, we get a proper "File not found" error
2. **Transformation is happening**: Using `debug-transform` shows the embed directive IS being transformed
3. **OutputService issue**: However, the placeholder still appears in the output

This confirms our hypothesis that the issue is in how transformed nodes are being handled by the OutputService, not in the transformation itself.

## Recommended Next Steps

Based on our findings, we recommend:

1. **Fix OutputService node lookup**: Enhance the transformed node lookup algorithm in OutputService

2. **Investigate node location changes**: Debug why the transformed node isn't being found at the expected location

3. **Compare with RunDirectiveHandler**: Investigate why RunDirectiveHandler's transformation is visible in output while EmbedDirectiveHandler's isn't, despite both being transformed

3. **Implement explicit transformation**: Use the approach from RunDirectiveHandler in EmbedDirectiveHandler:

```typescript
// Create replacement node
const replacement: TextNode = {
  type: 'Text',
  content,
  location: node.location
};

// Apply transformation explicitly (like RunDirectiveHandler does)
if (context.state.isTransformationEnabled()) {
  context.state.transformNode(node, replacement);
}

return {
  state: newState,
  replacement
};
```

4. **Add embed special handling in InterpreterService**: Consider adding special handling for embed directives in InterpreterService:

```typescript
// Special handling for imports and embeds in transformation mode
if ((isImportDirective || directiveNode.directive.kind === 'embed') && 
    currentState.isTransformationEnabled && 
    currentState.isTransformationEnabled()) {
  // Copy variables and handle transformations
}
```

## Testing Approach

Once a fix is implemented, test using:

1. **Direct Meld command**: `MELD_TRANSFORM=true meld examples/output-test.meld --stdout`
2. **Debug transformation**: `MELD_TRANSFORM=true meld debug-transform examples/output-test.meld --directive embed --include-content`
3. **Variable resolution**: `MELD_TRANSFORM=true meld debug-resolution examples/output-test.meld`

This issue appears to be related to the transformation pipeline not correctly propagating transformed embed directive nodes, causing the output to still render placeholders instead of the actual embedded content.
