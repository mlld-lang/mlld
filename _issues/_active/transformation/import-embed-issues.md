# Import and Embed Directive Issues

This document covers issues with import and embed directives in transformation mode.

## Common Issues

### 1. Variables Not Propagating from Imported Files

**Issue**: When using `@import` directives in transformation mode, variables from imported files are not properly propagated to the parent state.

**Symptoms**:
- Tests fail with "Variable X not found" errors
- Variables defined in imported files aren't accessible in the parent file
- Nested imports don't properly inherit variables from deeper imports

**Root Cause**:
The `ImportDirectiveHandler` isn't correctly copying variables from the imported state to the parent state when transformation is enabled. In transformation mode, the handler correctly replaces the directive with an empty text node, but returns early without copying variables.

### 2. Import/Embed Directives Not Processed

**Issue**: In transformation mode, import and embed directives remain in the output instead of being processed and replaced.

**Symptoms**:
- `@import` directives remain as-is in the output
- `@embed` directives are not replaced with embedded content
- Circular import detection doesn't work in transformation mode

**Root Cause**:
The directive handlers are not properly processing the directives when transformation is enabled, either due to configuration issues or error propagation problems.

### 3. Error Handling in Transformation Mode

**Issue**: Errors during import or embed processing are not properly propagated when transformation is enabled.

**Symptoms**:
- Circular import tests fail because the error is not propagated
- Tests expecting errors (like "section not found") pass unexpectedly
- Error messages are inconsistent or missing

**Root Cause**:
Error handling in transformation mode is different from normal mode, and errors are not properly propagated from handlers to the main API function.

## Detailed Analysis

### Import Directive Handler Issue

The core issue is in the `ImportDirectiveHandler.execute` method where there's a conditional branch for transformation mode:

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

When transformation is enabled, the code returns early without copying variables from the imported state to the parent state.

### Embed Directive Handler Issue

Similar to the import directive issue, the `EmbedDirectiveHandler` has problems with transformation:

1. When transformation is enabled, the embed directive should be replaced with the embedded content
2. Error conditions (like section not found) should still propagate errors
3. Circular dependency detection should work in transformation mode

## Comprehensive Solution

### 1. Fix ImportDirectiveHandler

Update the `ImportDirectiveHandler.execute` method to ensure variables are copied from the imported state to the parent state even when transformation is enabled:

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
    logger.debug('Copying imported variables to parent state', {
      parentStateExists: !!context.parentState,
      importedTextVars: Array.from(targetState.getAllTextVars().keys()),
      importedDataVars: Array.from(targetState.getAllDataVars().keys())
    });
    
    // Copy all text variables from the imported state to the parent state
    const textVars = targetState.getAllTextVars();
    textVars.forEach((value, key) => {
      context.parentState.setTextVar(key, value);
      logger.debug(`Copied text variable ${key} to parent state`, { value });
    });
    
    // Copy all data variables from the imported state to the parent state
    const dataVars = targetState.getAllDataVars();
    dataVars.forEach((value, key) => {
      context.parentState.setDataVar(key, value);
    });
    
    // Copy all path variables from the imported state to the parent state
    const pathVars = targetState.getAllPathVars();
    pathVars.forEach((value, key) => {
      context.parentState.setPathVar(key, value);
    });
    
    // Copy all command variables from the imported state to the parent state
    const commandVars = targetState.getAllCommandVars();
    commandVars.forEach((value, key) => {
      context.parentState.setCommandVar(key, value);
    });
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

### 2. Fix EmbedDirectiveHandler

Ensure the `EmbedDirectiveHandler.execute` method properly replaces the directive with embedded content and propagates errors:

```typescript
// In EmbedDirectiveHandler.execute
if (state.isTransformationEnabled && state.isTransformationEnabled()) {
  try {
    // Extract embedded content
    const embeddedContent = await extractContent(path, section);
    
    // Replace the directive with the embedded content
    const replacement: TextNode = {
      type: 'Text',
      content: embeddedContent,
      location: node.location
    };
    
    return {
      state,
      replacement
    };
  } catch (error) {
    // Important: Re-throw errors even in transformation mode
    logger.error('Error embedding content', {
      error,
      path,
      section
    });
    
    throw error; // Re-throw to ensure errors propagate
  }
}
```

### 3. Fix Error Propagation in main() function

Ensure the main API function in `api/index.ts` properly propagates errors in transformation mode:

```typescript
// In api/index.ts
try {
  // Interpret the AST with strict mode enabled
  const resultState = await services.interpreter.interpret(ast, {
    filePath,
    initialState: services.state,
    strict: true // Enable strict mode to ensure errors propagate
  });
  
  // ... rest of the code ...
} catch (error) {
  // Log the error and re-throw
  logger.error('Error during interpretation', {
    error,
    filePath
  });
  
  throw error; // Re-throw to ensure errors propagate to caller
}
```

### 4. Enhance Variable Resolution in OutputService

Improve variable resolution in the `OutputService.nodeToMarkdown` method to better handle variables from imported files:

```typescript
// In OutputService.ts, nodeToMarkdown method
if (node.type === 'Text') {
  let content = (node as TextNode).content;
  
  // Direct variable resolution in text nodes
  if (state.isTransformationEnabled() && content.includes('{{')) {
    // Log available variables for debugging
    logger.debug('Available variables for resolution:', {
      textVars: Array.from(state.getAllTextVars().keys()),
      dataVars: Array.from(state.getAllDataVars().keys())
    });
    
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
        logger.debug(`Replacing variable ${variableName}`, { value });
        content = content.replace(fullMatch, String(value));
      } else {
        logger.debug(`Variable ${variableName} not found in state`);
      }
    }
  }
  
  return content;
}
```

## Debugging Approaches

### 1. Check Variable Propagation

To verify that variables are being properly propagated from imported files to parent files:

```typescript
// In your test or code
console.log('Parent state variables before import:', 
  Array.from(context.services.state.getAllTextVars().keys()));

// After importing
console.log('Parent state variables after import:',
  Array.from(context.services.state.getAllTextVars().keys()));

// Check specific variable
const importedVar = context.services.state.getTextVar('importedVar');
console.log('Imported variable value:', importedVar);
```

### 2. Debug Directive Processing

To verify that directives are being properly processed in transformation mode:

```typescript
// Before processing
console.log('AST before processing:', ast.map(node => ({
  type: node.type,
  ...(node.type === 'Directive' ? {
    kind: node.directive?.kind,
    path: node.directive?.path?.value
  } : {})
})));

// After processing
console.log('AST after processing:', resultState.getTransformedNodes().map(node => ({
  type: node.type,
  ...(node.type === 'Text' ? {
    content: (node as TextNode).content.substring(0, 30) + '...'
  } : {})
})));
```

### 3. Create a Minimal Test Case

When debugging import or embed issues, create a minimal test case:

```typescript
it('DEBUG: import variable propagation', async () => {
  // Create a simple imported file
  context.fs.writeFileSync('imported.meld', '@text importedVar = "Imported content"');
  
  // Create a file that imports it
  context.fs.writeFileSync('test.meld', '@import imported.meld\nContent: {{importedVar}}');
  
  // Run with transformation enabled
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: true
  });
  
  // Debug info
  console.log('Result:', result);
  console.log('Has importedVar:', !!context.services.state.getTextVar('importedVar'));
  console.log('importedVar value:', context.services.state.getTextVar('importedVar'));
  
  // Verify result contains the imported variable value
  expect(result).toContain('Content: Imported content');
});
```

## Key Lessons and Testing Patterns

1. **Always Check Variable Copying**: When fixing import/embed issues, always ensure variables are properly copied between states.

2. **Use Explicit Transformation Options**: Be specific about what should be transformed:
   ```typescript
   services.state.enableTransformation({
     variables: true,
     directives: true,
     imports: true
   });
   ```

3. **Test Circular Import Detection**: Ensure circular import detection works in transformation mode:
   ```typescript
   // Create circular import files
   context.fs.writeFileSync('a.meld', '@import b.meld');
   context.fs.writeFileSync('b.meld', '@import a.meld');
   
   // Test that circular import is detected
   await expect(main('a.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   })).rejects.toThrow(/Circular import detected/);
   ```

4. **Test Variable Resolution After Import**: Verify that variables from imported files are accessible:
   ```typescript
   // Import file
   context.fs.writeFileSync('imported.meld', '@text greeting = "Hello"');
   context.fs.writeFileSync('test.meld', '@import imported.meld\n{{greeting}}');
   
   // Test variable resolution
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   });
   
   expect(result.trim()).toBe('Hello');
   ```

5. **Test Embed Content Replacement**: Verify that embed directives are replaced with content:
   ```typescript
   // Create file with embedded content
   context.fs.writeFileSync('content.md', '# Section One\nContent one\n# Section Two\nContent two');
   context.fs.writeFileSync('test.meld', '@embed content.md # Section Two');
   
   // Test embed replacement
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   });
   
   expect(result.trim()).toBe('Content two');
   ``` 