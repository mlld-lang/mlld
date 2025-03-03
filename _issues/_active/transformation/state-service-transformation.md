# StateService Transformation Reference

This document provides a comprehensive reference for how the `StateService` manages transformed nodes and transformation state in Meld.

## Core Transformation Architecture

### Dual Node Storage Model

The `StateService` maintains two parallel node arrays:

- `nodes`: The original, unmodified AST nodes
- `transformedNodes`: The transformed versions of those nodes after processing

This dual storage approach allows Meld to maintain both the original content structure and the transformed output simultaneously.

```typescript
// From StateNode interface
export interface StateNode {
  // ...other properties
  readonly nodes: MeldNode[];
  readonly transformedNodes?: MeldNode[];
  // ...other properties
}
```

### Transformation Control Flags

The `StateService` maintains several internal flags to control transformation:

```typescript
private _transformationEnabled: boolean = false;
private _transformationOptions: TransformationOptions = {
  variables: false,
  directives: false,
  commands: false,
  imports: false
};
```

These flags determine:
1. Whether transformation is active at all
2. Which specific aspects of transformation are enabled

## Key Methods for Transformation

### Transformation Control

```typescript
/**
 * Enable transformation with specific options
 * @param options Options for selective transformation, or true/false for all
 */
enableTransformation(options?: TransformationOptions | boolean): void {
  if (typeof options === 'boolean') {
    // Legacy behavior - all on or all off
    this._transformationEnabled = options;
    this._transformationOptions = options ? 
      { variables: true, directives: true, commands: true, imports: true } : 
      { variables: false, directives: false, commands: false, imports: false };
  } else {
    // Selective transformation
    this._transformationEnabled = true;
    this._transformationOptions = {
      ...{ variables: true, directives: true, commands: true, imports: true },
      ...options
    };
  }

  if (this._transformationEnabled && !this.currentState.transformedNodes) {
    // Initialize transformed nodes with current nodes when enabling transformation
    this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
  }
}
```

### Node Access and Transformation

```typescript
// Get original nodes
getNodes(): MeldNode[] {
  return [...this.currentState.nodes];
}

// Get transformed nodes (or originals if transformation is disabled)
getTransformedNodes(): MeldNode[] {
  if (this._transformationEnabled) {
    return this.currentState.transformedNodes ? 
      [...this.currentState.transformedNodes] : 
      [...this.currentState.nodes];
  }
  return [...this.currentState.nodes];
}

// Replace a node with its transformed version
transformNode(original: MeldNode, transformed: MeldNode): void {
  this.checkMutable();
  if (!this._transformationEnabled) {
    return;
  }

  // Initialize transformed nodes if needed
  let transformedNodes = this.currentState.transformedNodes ? 
    [...this.currentState.transformedNodes] : 
    [...this.currentState.nodes];
  
  // Find the node to replace (by reference or location)
  let index = transformedNodes.findIndex(node => node === original);
  // Fall back to location matching if reference doesn't match
  if (index === -1 && original.location && transformed.location) {
    index = transformedNodes.findIndex(node => 
      node.location?.start?.line === original.location?.start?.line &&
      node.location?.start?.column === original.location?.start?.column &&
      node.location?.end?.line === original.location?.end?.line &&
      node.location?.end?.column === original.location?.end?.column
    );
  }

  if (index !== -1) {
    // Replace the node at the found index
    transformedNodes[index] = transformed;
  } else {
    // Try finding in original nodes if not found in transformed
    // ...additional location checking logic
    
    // Replace the node
    transformedNodes[originalIndex] = transformed;
  }
  
  this.updateState({ transformedNodes }, 'transformNode');
}
```

### Selective Transformation

```typescript
/**
 * Check if a specific transformation type is enabled
 * @param type The transformation type to check (variables, directives, commands, imports)
 * @returns Whether the specified transformation type is enabled
 */
shouldTransform(type: keyof TransformationOptions): boolean {
  return this._transformationEnabled && Boolean(this._transformationOptions[type]);
}

/**
 * Get the current transformation options
 * @returns The current transformation options
 */
getTransformationOptions(): TransformationOptions {
  return { ...this._transformationOptions };
}
```

## Transformation State Propagation

The `StateService` carefully manages transformation state during state operations:

### Adding Nodes

```typescript
addNode(node: MeldNode): void {
  this.checkMutable();
  const nodes = [...this.currentState.nodes, node];
  const transformedNodes = this._transformationEnabled ? 
    (this.currentState.transformedNodes ? [...this.currentState.transformedNodes, node] : [...nodes]) : 
    undefined;
  this.updateState({ nodes, transformedNodes }, 'addNode');
}
```

When adding a node, it's added to both the original nodes array and the transformed nodes array (if transformation is enabled).

### Creating Child States

```typescript
createChildState(): IStateService {
  const child = new StateService(this);
  
  // Copy transformation state
  child._transformationEnabled = this._transformationEnabled;
  if (child._transformationEnabled && !child.currentState.transformedNodes) {
    child.currentState = this.stateFactory.updateState(child.currentState, {
      transformedNodes: [...child.currentState.nodes]
    });
  }
  
  // ...other setup
  
  return child;
}
```

Child states inherit the transformation configuration from their parent state.

### Cloning States

```typescript
clone(): IStateService {
  const cloned = new StateService();
  
  // ...state cloning logic
  
  // Copy flags
  cloned._transformationEnabled = this._transformationEnabled;
  
  // Initialize transformation state if enabled
  if (cloned._transformationEnabled && !cloned.currentState.transformedNodes) {
    cloned.currentState = this.stateFactory.updateState(cloned.currentState, {
      transformedNodes: [...cloned.currentState.nodes]
    });
  }
  
  // ...other setup
  
  return cloned;
}
```

Cloned states preserve the transformation configuration from the original state.

## Integration with Other Services

### InterpreterService Integration

The `InterpreterService` uses `StateService` transformation capabilities to replace directive nodes with their processed content:

```typescript
// Inside InterpreterService.interpretNode for directive processing
if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
  // Apply the transformation by replacing the directive node with the replacement
  try {
    // Ensure transformed nodes array is initialized
    // ...

    // Apply the transformation
    currentState.transformNode(node, replacement as MeldNode);
  } catch (transformError) {
    // Error handling
  }
}
```

### DirectiveHandler Integration

Directive handlers can provide replacement nodes via the `DirectiveResult` interface:

```typescript
// Example DirectiveResult with replacement
return {
  state: resultState,
  replacement: {
    type: 'Text',
    content: processedContent,
    location: directiveNode.location
  }
};
```

The `InterpreterService` detects these replacements and applies them using `transformNode()`.

## Common Transformation Issues

1. **Uninitialized Transformed Nodes**
   - Symptoms: `TypeError: Cannot read properties of undefined (reading 'length')`
   - Cause: Trying to access `transformedNodes` before they're initialized
   - Solution: Check if `transformedNodes` exists and initialize if needed

2. **Node Not Found During Transformation**
   - Symptoms: `Error: Cannot transform node: original node not found`
   - Cause: Attempting to transform a node that doesn't exist in current state
   - Solution: Verify node exists in state before attempting transformation

3. **Immutability Violations**
   - Symptoms: `Error: Cannot modify immutable state`
   - Cause: Attempting to transform nodes in an immutable state
   - Solution: Check `isImmutable` before applying transformations

4. **State Inheritance Issues**
   - Symptoms: Transformations not propagating to child states
   - Cause: Transformation flags not properly copied during state operations
   - Solution: Ensure flags are properly copied to child/cloned states

5. **Selective Transformation Misconfiguration**
   - Symptoms: Some transformations applied, others missing
   - Cause: Incorrect `TransformationOptions` configuration
   - Solution: Verify all needed transformation types are enabled

## Debugging Transformation State

To debug transformation state issues:

```typescript
// Check if transformation is enabled
console.log('Transformation enabled:', state.isTransformationEnabled());

// Check specific transformation options
console.log('Transformation options:', state.getTransformationOptions());

// Check node counts
console.log('Original nodes:', state.getNodes().length);
console.log('Transformed nodes:', state.getTransformedNodes().length);

// Compare specific nodes
const originalNodes = state.getNodes();
const transformedNodes = state.getTransformedNodes();
console.log('Node at index 0 (original):', originalNodes[0]);
console.log('Node at index 0 (transformed):', transformedNodes[0]);
```

## Testing Transformation

Key aspects to test:

1. **Transformation Enablement**: Verify transformation is correctly enabled/disabled
2. **Node Transformation**: Verify nodes are correctly transformed
3. **State Propagation**: Verify transformation state is correctly propagated
4. **Immutability Protection**: Verify immutable states can't be transformed
5. **Selective Transformation**: Verify selective transformation options work correctly

Example test pattern:

```typescript
// Test selective transformation
it('should only transform variables when only variables option is enabled', () => {
  service.enableTransformation({ variables: true, directives: false });
  
  // Add a directive node
  const directiveNode = { /* directive node */ };
  service.addNode(directiveNode);
  
  // Try to transform it
  const replacement = { /* replacement node */ };
  service.transformNode(directiveNode, replacement);
  
  // Verify the node wasn't transformed (because directives: false)
  expect(service.getTransformedNodes()[0]).toEqual(directiveNode);
});
```

# State Service Transformation Issues

## Recent Testing Evidence (March 2024)

Our recent testing has confirmed that state propagation is a critical issue in the transformation process. The evidence suggests:

1. **Variable Propagation Breakdown**: Testing the path variable transformation reveals that variables are not being properly processed at all. Raw directives remain in the output, suggesting that transformation isn't being applied correctly.

2. **State Silos**: Variables appear to remain "siloed" in child states without being propagated to parent states. In the import test, the important `importedVar` exists in the child state but is not accessible from the parent state.

3. **Effectiveness of Variable Copying Solution**: The fix in diff.txt, which implements explicit variable copying from child states to parent states, suggests that relying on the built-in state inheritance mechanism isn't sufficient in transformation mode.

4. **Code Fence Wrapping**: The presence of code fences in the output suggests that there is basic formatting happening, but the state transformations aren't being properly applied.

This evidence supports the theory that the architectural issue is in how state is managed across component boundaries during transformation. The variable copying approach directly addresses this root cause by ensuring state changes propagate upward in the state hierarchy.

## Overview

This document covers issues with how the `StateService` handles transformation in Meld.

## Key Concepts 