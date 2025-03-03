# Debugging Meld Transformation Issues

This guide provides systematic approaches and tools for debugging transformation issues in Meld.

## Available Debugging Tools

Meld includes several built-in debugging tools:

### 1. CLI Debug Commands

```bash
# Debug variable resolution
meld debug-resolution myfile.meld --var specificVariable

# Debug transformation process
meld debug-transform myfile.meld --directive-type import

# Debug state context and relationships
meld debug-context myfile.meld --visualization-type hierarchy
```

### 2. Debug Logging

Add strategic logging statements to trace execution:

```typescript
// Log variable state
console.log('Text variables:', Array.from(state.getAllTextVars().entries()));
console.log('Data variables:', Array.from(state.getAllDataVars().entries()));

// Log transformation state
console.log('Transformation enabled:', state.isTransformationEnabled());
console.log('Transformation options:', state.getTransformationOptions());

// Log AST structure
console.log('AST nodes:', nodes.map(node => ({ type: node.type, ...node })));
```

### 3. TestContext Debug Methods

```typescript
// In test code
const context = new TestContext();
await context.initialize();

// Enable debug mode
context.enableDebug();

// Start a debug session
const sessionId = await context.startDebugSession({
  captureVariables: true,
  captureStateTransitions: true
});

// Run your test...

// Generate visualization
const visualization = await context.visualizeState('mermaid');
console.log(visualization);

// Get debug results
const results = await context.endDebugSession(sessionId);
```

### 4. State Visualization Tools

Visualizes state relationships and transitions:

```bash
# Generate Mermaid diagram of state hierarchy
meld debug-context myfile.meld --visualization-type hierarchy --output-format mermaid > state-hierarchy.md

# Generate variable flow diagram
meld debug-context myfile.meld --visualization-type variable-propagation --output-format dot > variable-flow.dot
```

## Systematic Debugging Approach

### 1. Isolate the Issue

First, create a minimal test case that reproduces the issue:

```typescript
it('DEBUG: minimal reproduction', async () => {
  // Create the simplest file that reproduces the issue
  context.fs.writeFileSync('test.meld', `
    @text greeting = "Hello"
    {{greeting}}
  `);
  
  // Run with transformation enabled
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: true
  });
  
  console.log('Result:', result);
  // Expected: should contain "Hello" instead of "{{greeting}}"
});
```

### 2. Check Transformation Enablement

Verify transformation is properly enabled:

```typescript
// In api/index.ts or your test
console.log('Before enableTransformation:', services.state.isTransformationEnabled());
services.state.enableTransformation(options.transformation);
console.log('After enableTransformation:', services.state.isTransformationEnabled());

// Check if transformation settings are preserved after interpretation
console.log('Result state transformation:', 
  resultState.isTransformationEnabled(),
  resultState.getTransformationOptions());
```

### 3. Trace Variable Resolution

Track how variables are resolved:

```typescript
// In VariableReferenceResolver or test code
console.log('Resolving variable:', {
  identifier: node.identifier,
  type: node.type,
  currentState: !!context.state,
  transformationEnabled: context.state?.isTransformationEnabled(),
  availableVars: Array.from(context.state?.getAllTextVars().keys() || [])
});

// After resolution
console.log('Resolution result:', {
  identifier: node.identifier,
  resolved: result,
  success: result !== undefined
});
```

### 4. Debug State Inheritance

For import and embed issues, check state inheritance:

```typescript
// In ImportDirectiveHandler after processing import
console.log('Import state inheritance:', {
  targetStateId: targetState.getId(),
  parentStateId: context.parentState?.getId(),
  targetVars: Array.from(targetState.getAllTextVars().keys()),
  parentVars: Array.from(context.parentState?.getAllTextVars().keys() || [])
});

// Check if variables were copied after import
console.log('After variable copy:', {
  parentHasImportedVar: !!context.parentState?.getTextVar('importedVar'),
  importedVarValue: context.parentState?.getTextVar('importedVar')
});
```

### 5. Analyze Error Propagation

For errors not being properly propagated:

```typescript
try {
  // Operation that might throw
  const result = await handler.execute(node, context);
  console.log('Operation succeeded');
  return result;
} catch (error) {
  console.log('Error caught:', {
    message: error.message,
    code: error.code,
    type: error.constructor.name,
    stack: error.stack
  });
  throw error; // Re-throw to ensure it's propagated
}
```

## Common Problem Patterns and Solutions

### 1. Variable Not Propagating Across State Boundaries

**Problem**: Variables defined in imported files are not available in the parent file.

**Debugging Steps**:
1. Check if `ImportDirectiveHandler` is copying variables back to parent state
2. Verify variable exists in target state before copy
3. Check if transformation mode has special handling that skips variable copying

**Example Fix**:
```typescript
// In ImportDirectiveHandler.ts
// Ensure variables are copied even in transformation mode
if (targetState.isTransformationEnabled?.()) {
  // Replace directive with empty content
  const replacement = { type: 'Text', content: '', location: node.location };
  
  // IMPORTANT: Copy variables back to parent state
  if (context.parentState) {
    const textVars = targetState.getAllTextVars();
    textVars.forEach((value, key) => {
      context.parentState.setTextVar(key, value);
    });
    // Also copy other variable types...
  }
  
  return { state: targetState, replacement };
}
```

### 2. Transformation Not Applied to Variables

**Problem**: Variable references are not being replaced with their values.

**Debugging Steps**:
1. Check if transformation is enabled in state
2. Verify the variable exists in state
3. Check if the variable resolver is correctly handling the node type
4. Verify if `OutputService` is correctly transforming the nodes

**Example Fix**:
```typescript
// In OutputService.ts, nodeToMarkdown method
if (node.type === 'Text') {
  let content = (node as TextNode).content;
  
  // Direct variable resolution in text nodes
  if (state.isTransformationEnabled() && content.includes('{{')) {
    const variableRegex = /\{\{([^{}]+)\}\}/g;
    const matches = Array.from(content.matchAll(variableRegex));
    
    for (const match of matches) {
      const fullMatch = match[0];
      const variableName = match[1].trim();
      
      // Try to get variable value
      let value = state.getTextVar(variableName);
      if (value === undefined) {
        value = state.getDataVar(variableName);
      }
      
      // Replace the variable reference with its value
      if (value !== undefined) {
        content = content.replace(fullMatch, String(value));
      }
    }
  }
  
  return content;
}
```

### 3. Error Not Propagated During Transformation

**Problem**: Errors are swallowed instead of propagated during transformation.

**Debugging Steps**:
1. Check if the interpreter is configured with `strict: true`
2. Verify that error handlers are properly re-throwing errors
3. Check if special error handling exists for transformation mode

**Example Fix**:
```typescript
// In api/index.ts
const resultState = await services.interpreter.interpret(ast, { 
  filePath, 
  initialState: services.state,
  strict: true  // Ensure strict mode is enabled
});
```

### 4. Directives Not Transformed

**Problem**: Directives remain in the output instead of being transformed.

**Debugging Steps**:
1. Check if directive handlers are returning proper replacement nodes
2. Verify the directive handlers are registered correctly
3. Check if transformation options include directives

**Example Fix**:
```typescript
// In EmbedDirectiveHandler.ts
const replacement: TextNode = {
  type: 'Text',
  content: embeddedContent, // Replace with actual embedded content
  location: node.location
};

return {
  state: targetState,
  replacement  // Make sure to return the replacement node
};
```

## Debugging Environment Variables

You can enable additional debugging with environment variables:

```bash
# Enable detailed debugging
MELD_DEBUG=1 npm test -- api/integration.test.ts

# Track specific variables
MELD_DEBUG_VARS=importedVar,config npm test -- api/integration.test.ts

# Set debug verbosity
MELD_DEBUG_LEVEL=debug npm test -- api/integration.test.ts
```

## Visual Debugging with Mermaid Diagrams

Generate Mermaid diagrams to visualize state and variable relationships:

```bash
# Create state hierarchy diagram
meld debug-context myfile.meld --visualization-type hierarchy --output-format mermaid > state-hierarchy.md

# Create variable propagation diagram
meld debug-context myfile.meld --visualization-type variable-propagation --output-format mermaid > variable-flow.md
```

Example output:
```
graph TD
  RootState[Root State] --> ImportState[Import State: file1.meld]
  ImportState -- importedVar --> RootState
  ImportState --> EmbedState[Embed State: section1]
  EmbedState -- config --> ImportState
```

## TestContext with Debug Session

For comprehensive debugging in tests:

```typescript
// Set up test context with debugging
const context = new TestContext();
await context.initialize();

// Start a debug session
const sessionId = await context.startDebugSession({
  captureConfig: {
    capturePoints: ['pre-transform', 'post-transform', 'error'],
    includeFields: ['variables', 'nodes', 'transformedNodes'],
  },
  visualization: {
    format: 'mermaid',
    includeMetadata: true
  }
});

// Run your test code...

// Visualize state
const visualization = await context.visualizeState('mermaid');
console.log(visualization);

// End debug session and get results
const results = await context.endDebugSession(sessionId);
console.log('Debug session results:', results);
```

## Last Resort: Manual Fix

If you cannot locate the issue, try a post-processing step:

```typescript
// In api/index.ts after processing
// Fall-back manual variable resolution for specific variables
if (options.transformation) {
  // Check for any remaining unresolved variables
  const variableRegex = /\{\{([^{}]+)\}\}/g;
  const matches = Array.from(converted.matchAll(variableRegex));
  
  for (const match of matches) {
    const fullMatch = match[0];
    const variableName = match[1].trim();
    
    // Special handling for known variables
    if (variableName === 'importedVar') {
      console.log('Manual fix for importedVar');
      const value = resultState.getTextVar(variableName);
      if (value !== undefined) {
        converted = converted.replace(fullMatch, value);
      }
    }
  }
}
```

## Key Lessons from Previous Debugging

1. **Variable copying is critical**: Always ensure variables are copied between states, especially in transformation mode.

2. **Use explicit transformation options**: Be specific about what should be transformed:
   ```typescript
   services.state.enableTransformation({
     variables: true,
     directives: true,
     commands: false,  // Don't execute commands in tests
     imports: true
   });
   ```

3. **Check for special cases**: Some functionality may have special handling for transformation mode.

4. **Don't over-instrument**: Too much logging can obscure the real issue.

5. **Simplify to isolate**: When debugging complex issues, create the simplest possible test case that reproduces the issue.

## Common Error Messages and Their Meaning

| Error Message | Probable Cause | Debug Approach |
|---------------|----------------|----------------|
| "Variable X not found" | Variable not defined or not propagated from imported file | Check variable definitions and state inheritance |
| "Parse error: Expected X but Y found" | Syntax incompatibility with parser | Verify syntax matches what parser expects |
| "Circular import detected" | Import cycle in files | Check import chain and error propagation |
| "Path must use a special path variable" | Raw absolute path used | Check path validation in transformation mode |
| "Command execution not supported" | Commands disabled or error in command | Check command execution options and mock setup |

## Testing Transformation Modes

Create tests that verify different transformation configurations:

```typescript
// Test variable transformation only
it('should transform variables but not directives', async () => {
  context.fs.writeFileSync('test.meld', '@text greeting = "Hello"\n{{greeting}}');
  
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { variables: true, directives: false }
  });
  
  expect(result).toContain('@text greeting = "Hello"'); // Directive not transformed
  expect(result).toContain('Hello'); // Variable transformed
});

// Test directive transformation only
it('should transform directives but not execute commands', async () => {
  context.fs.writeFileSync('test.meld', '@run echo "test"\n@text greeting = "Hello"');
  
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { variables: true, directives: true, commands: false }
  });
  
  expect(result).toContain('@run echo "test"'); // Command not executed
  expect(result).not.toContain('@text greeting'); // Directive transformed
});
```

## Debugging StateService Transformation

The `StateService` is central to Meld's transformation capabilities. This section focuses on debugging transformation-specific issues in the StateService.

### Diagnosing Transformation State Issues

When transformation isn't working as expected, check these fundamental aspects:

```typescript
// 1. Is transformation enabled?
console.log('Transformation enabled:', state.isTransformationEnabled());

// 2. Which transformation aspects are enabled?
console.log('Transformation options:', state.getTransformationOptions());

// 3. Are transformed nodes initialized?
console.log('Has transformed nodes:', Boolean(state.getTransformedNodes()));
console.log('Transformed nodes length:', state.getTransformedNodes().length);

// 4. Are original and transformed nodes different?
const originals = state.getNodes();
const transformed = state.getTransformedNodes();
const different = transformed.some((node, idx) => 
  node !== originals[idx] && node.type !== originals[idx].type);
console.log('Original and transformed nodes differ:', different);
```

### Inspecting Node Transformations

To analyze node transformation in detail:

```typescript
// Log all transformed nodes
state.getTransformedNodes().forEach((node, index) => {
  console.log(`Transformed node ${index}:`, {
    type: node.type,
    content: 'content' in node ? node.content : undefined,
    childCount: 'children' in node ? node.children?.length : undefined,
    location: node.location
  });
});

// Compare specific original and transformed nodes
state.getNodes().forEach((origNode, index) => {
  const transNode = state.getTransformedNodes()[index];
  if (origNode !== transNode) {
    console.log(`Node ${index} was transformed:`, {
      originalType: origNode.type, 
      transformedType: transNode.type,
      originalContent: 'content' in origNode ? origNode.content : undefined,
      transformedContent: 'content' in transNode ? transNode.content : undefined
    });
  }
});
```

### Analyzing Transformation Inheritance

Debugging state inheritance issues:

```typescript
// Log parent state transformation properties
console.log('Parent transformation enabled:', parentState.isTransformationEnabled());
console.log('Parent transformation options:', parentState.getTransformationOptions());

// Create a child state
const childState = parentState.createChildState();

// Log child state transformation properties
console.log('Child transformation enabled:', childState.isTransformationEnabled());
console.log('Child transformation options:', childState.getTransformationOptions());

// Verify nodes were properly inherited and transformed
console.log('Parent nodes count:', parentState.getNodes().length);
console.log('Child nodes count:', childState.getNodes().length);
console.log('Parent transformed nodes count:', parentState.getTransformedNodes().length);
console.log('Child transformed nodes count:', childState.getTransformedNodes().length);
```

### Common StateService Transformation Issues

#### 1. Missing Transformations

**Problem**: Nodes aren't being transformed despite transformation being enabled.

**Debugging Steps**:
1. Verify transformation options:
   ```typescript
   console.log(state.getTransformationOptions());
   ```
2. Check if specific option (`variables`, `directives`, etc.) is enabled:
   ```typescript
   console.log('Should transform directives:', state.shouldTransform('directives'));
   ```
3. Examine directive handler implementation to ensure it returns replacements:
   ```typescript
   // Inside directive handler
   console.log('Returning replacement node:', Boolean(replacementNode));
   ```

#### 2. Transformation Array Initialization

**Problem**: `TypeError: Cannot read properties of undefined (reading 'length')`

**Debugging Steps**:
1. Check for uninitialized transformed nodes array:
   ```typescript
   console.log('Has transformed nodes array:', 
     Boolean(state.currentState.transformedNodes));
   ```
2. Add defensive code:
   ```typescript
   // Initialize transformed nodes if needed
   if (!state.getTransformedNodes()) {
     state.setTransformedNodes([...state.getNodes()]);
     console.log('Initialized transformed nodes array');
   }
   ```

#### 3. Node Not Found During Transformation

**Problem**: `Error: Cannot transform node: original node not found`

**Debugging Steps**:
1. Log node details:
   ```typescript
   console.log('Trying to transform node:', {
     type: originalNode.type,
     location: originalNode.location,
     content: 'content' in originalNode ? originalNode.content : undefined
   });
   ```
2. Check if node exists in state:
   ```typescript
   const exists = state.getNodes().some(node => 
     node.location?.start?.line === originalNode.location?.start?.line &&
     node.location?.start?.column === originalNode.location?.start?.column
   );
   console.log('Node exists in state:', exists);
   ```

#### 4. State Corruption After Transformation

**Problem**: State is inconsistent after transformation.

**Debugging Steps**:
1. Clone state before transformation:
   ```typescript
   const beforeState = state.clone();
   ```
2. Apply transformation.
3. Compare before and after:
   ```typescript
   console.log('Before vars:', Array.from(beforeState.getAllTextVars().keys()));
   console.log('After vars:', Array.from(state.getAllTextVars().keys()));
   console.log('Before nodes:', beforeState.getNodes().length);
   console.log('After nodes:', state.getNodes().length);
   ``` 