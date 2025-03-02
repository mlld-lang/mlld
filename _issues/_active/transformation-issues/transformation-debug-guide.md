# Debugging API Transformation Issues

## Investigation Guide for Transformation Not Being Applied

This guide outlines a systematic approach to debug why transformation isn't being applied in the API integration tests, despite being explicitly enabled.

## Key Components to Investigate

### 1. StateService Transformation Mechanism

The core transformation functionality is in `StateService.ts`:

```typescript
// Check if the transformation is properly being enabled
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

Key points to check:
- Is `_transformationEnabled` being set properly?
- Is `transformedNodes` being initialized correctly?
- Does `isTransformationEnabled()` return the expected value?

### 2. API Main Function Processing

The `main()` function in `api/index.ts` is responsible for processing the transformation:

```typescript
// Enable transformation if requested (do this before interpretation)
if (options.transformation) {
  // If transformation is a boolean, use the legacy all-or-nothing approach
  // If it's an object with options, use selective transformation
  if (typeof options.transformation === 'boolean') {
    services.state.enableTransformation(options.transformation);
  } else {
    services.state.enableTransformation(options.transformation);
  }
}

// Interpret the AST
const resultState = await services.interpreter.interpret(ast, { filePath, initialState: services.state });

// Ensure transformation state is preserved from original state service
if (services.state.isTransformationEnabled()) {
  resultState.enableTransformation(
    typeof options.transformation === 'boolean' 
      ? options.transformation 
      : options.transformation
  );
}

// Get transformed nodes if available
const nodesToProcess = resultState.isTransformationEnabled() && resultState.getTransformedNodes()
  ? resultState.getTransformedNodes()
  : ast;
```

Key points to check:
- Is `options.transformation` being correctly passed?
- Is `resultState` correctly inheriting the transformation state?
- Is `resultState.isTransformationEnabled()` returning `true`?
- Is `resultState.getTransformedNodes()` returning the expected transformed nodes?

### 3. VariableReferenceResolver Implementation

The `VariableReferenceResolver` is responsible for actually replacing variable references:

```typescript
async resolveNodes(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  let result = '';
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      // Text node content handling
    } else if (node.type === 'TextVar') {
      // Handle text variable nodes
      if (context.state?.isTransformationEnabled() && 
          (context.state?.shouldTransform?.('variables') ?? true)) {
        // Variable transformation code
      } else {
        // Keep the variable reference if transformation is not enabled
        result += `{{${(node as TextVarNode).identifier}}}`;
      }
    } else if (node.type === 'DataVar') {
      // Handle data variable nodes
    }
  }
  
  return result;
}
```

Key points to check:
- Is `context.state?.isTransformationEnabled()` evaluating to `true`?
- Is `context.state?.shouldTransform?.('variables')` evaluating to `true`?
- Are variable nodes being correctly identified as `TextVar` or `DataVar`?

## Debugging Approach

1. **Add Debug Logging**:
   ```typescript
   // In api/index.ts, add these logging statements
   console.log('Before enableTransformation:', {
     isEnabled: services.state.isTransformationEnabled(),
     options: services.state.getTransformationOptions()
   });
   
   services.state.enableTransformation(options.transformation);
   
   console.log('After enableTransformation:', {
     isEnabled: services.state.isTransformationEnabled(),
     options: services.state.getTransformationOptions()
   });
   
   // After interpret call
   console.log('ResultState transformation:', {
     isEnabled: resultState.isTransformationEnabled(),
     options: resultState.getTransformationOptions(),
     hasTransformedNodes: !!resultState.getTransformedNodes(),
     transformedNodesLength: resultState.getTransformedNodes()?.length || 0
   });
   ```

2. **Add Test-Specific Debug Code**:
   ```typescript
   // In a test case
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services as unknown as Partial<Services>,
     transformation: { 
       variables: true, 
       directives: true 
     }
   });
   
   // Log result content
   console.log('Test Result Content:', result);
   ```

3. **Create Debug Test**:
   Create a minimal test case that isolates the variable transformation:
   ```typescript
   it('DEBUG: variable transformation test', async () => {
     const content = `
       @text greeting = "Hello"
       {{greeting}}
     `;
     await context.writeFile('debug.meld', content);
     
     // Log everything
     console.log('Initial state:', {
       enabled: context.services.state.isTransformationEnabled(),
       options: context.services.state.getTransformationOptions()
     });
     
     const result = await main('debug.meld', {
       fs: context.fs,
       services: context.services as unknown as Partial<Services>,
       transformation: { variables: true, directives: true }
     });
     
     console.log('Result:', result);
     // This should print "Hello" if transformation is working
   });
   ```

## Potential Issues and Solutions

1. **State Inheritance Issue**:
   - The result state might not be correctly inheriting from the initial state
   - Solution: Ensure `resultState` correctly copies transformation settings

2. **Service Initialization Issue**:
   - The test services might not be properly initialized for transformation
   - Solution: Check if `TestContext` initialization properly sets up transformation

3. **AST Structure Issue**:
   - The AST might have an unexpected structure that the resolver isn't handling
   - Solution: Log the AST structure and verify it matches what the resolver expects

4. **Mock Issues in Tests**:
   - Tests might be using mocks that interfere with transformation
   - Solution: Check if any mocked services are causing the issue

5. **Output Post-Processing Issue**:
   - Transformation might be happening but being lost in post-processing
   - Solution: Add logging before and after post-processing in `main()`

## Testing the Fix

Once you've identified and fixed the issue, validate it works by:

1. Running a simple test with transformation enabled
2. Running the full integration test suite
3. Checking that variables are correctly replaced with their values
4. Verifying that selective transformation options work as expected 