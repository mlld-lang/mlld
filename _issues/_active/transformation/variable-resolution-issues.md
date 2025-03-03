# Variable Resolution Issues

This document covers issues with variable resolution in transformation mode.

## Common Issues

### 1. Variable References Not Transformed

**Issue**: Variable references (`{{variable}}`) are not replaced with their values when transformation is enabled.

**Symptoms**:
- Variable references remain unchanged in the output (`{{greeting}}` instead of "Hello")
- Tests expecting transformed variables fail
- Output contains raw variable references

**Root Cause**:
The `OutputService` or `VariableReferenceResolver` isn't correctly resolving and replacing variable references when transformation is enabled.

### 2. Array and Object Access Problems

**Issue**: Accessing array elements or object properties in variable references doesn't work correctly.

**Symptoms**:
- `{{items.0}}` or `{{items[0]}}` not resolving to array elements
- `{{config.value}}` not resolving to object properties
- Error messages about failed access to fields

**Root Cause**:
Field access in variable references requires special handling to convert string indices to numeric indices for arrays and handle both dot notation and bracket notation correctly.

### 3. Inconsistent Field Access Formats

**Issue**: Different notations for accessing array elements and object properties are handled inconsistently.

**Symptoms**:
- Dot notation (`items.0`) works but bracket notation (`items[0]`) doesn't
- Inconsistent error messages for invalid field access
- Confusion about which notation should be used

**Root Cause**:
The variable resolver code paths for different access notations may not be consistent, and the AST representation might differ between notations.

## Detailed Analysis

### Variable Resolution in AST

Variable references are represented in the AST in two main forms:

1. **TextVar**: Simple variable references like `{{greeting}}`
   ```javascript
   {
     "type": "TextVar",
     "identifier": "greeting",
     "varType": "text",
     "location": {...}
   }
   ```

2. **DataVar**: Variable references with field access like `{{config.value}}` or `{{items[0]}}`
   ```javascript
   {
     "type": "DataVar",
     "identifier": "config",
     "varType": "data",
     "fields": [
       { "type": "field", "value": "value" }
     ],
     "location": {...}
   }
   ```

   For array access:
   ```javascript
   {
     "type": "DataVar",
     "identifier": "items",
     "varType": "data",
     "fields": [
       { "type": "index", "value": 0 }
     ],
     "location": {...}
   }
   ```

### Variable Resolution Process

1. The parser generates an AST with TextVar and DataVar nodes
2. The `VariableReferenceResolver` processes these nodes
3. When transformation is enabled, variable nodes should be replaced with text nodes containing their values
4. The `OutputService` may perform additional resolution for Text nodes that contain variable references

### Field Access Patterns

The AST distinguishes between different types of field access:

- **Dot Notation for Object Properties**: `config.value` represented as `{ "type": "field", "value": "value" }`
- **Bracket Notation for Array Indices**: `items[0]` represented as `{ "type": "index", "value": 0 }`
- **Dot Notation for Array Indices**: `items.0` may be represented differently depending on parser version

## Comprehensive Solution

### 1. Fix VariableReferenceResolver

Update the `VariableReferenceResolver` to properly handle all variable node types and field access patterns:

```typescript
export class VariableReferenceResolver {
  // ...

  private resolveNode(node: MeldNode, context: ResolutionContext): MeldNode {
    if (node.type === 'TextVar') {
      // Handle simple variable references ({{variable}})
      const resolved = this.resolveTextVar(node, context);
      
      // If transformation is enabled, replace with resolved value
      if (context.state?.isTransformationEnabled() && 
          (context.state?.shouldTransform?.('variables') ?? true)) {
        return {
          type: 'Text',
          content: resolved ?? `{{${node.identifier}}}`,
          location: node.location
        };
      }
    } else if (node.type === 'DataVar') {
      // Handle data variable references with field access ({{config.value}} or {{items[0]}})
      const resolved = this.resolveDataVar(node, context);
      
      // If transformation is enabled, replace with resolved value
      if (context.state?.isTransformationEnabled() && 
          (context.state?.shouldTransform?.('variables') ?? true)) {
        return {
          type: 'Text',
          content: resolved ?? `{{${this.formatDataVarReference(node)}}}`,
          location: node.location
        };
      }
    } else if (node.type === 'Text') {
      // Check if text node contains variable references
      return this.resolveTextContent(node, context);
    }
    
    // Return node unchanged if not handled
    return node;
  }

  private resolveTextVar(node: TextVarNode, context: ResolutionContext): string | undefined {
    const { identifier } = node;
    
    // Resolve variable in context
    try {
      const value = this.resolveInContext(identifier, context);
      return this.formatValue(value);
    } catch (error) {
      logger.error('Error resolving TextVar', {
        error,
        identifier
      });
      return undefined;
    }
  }

  private resolveDataVar(node: DataVarNode, context: ResolutionContext): string | undefined {
    const { identifier, fields } = node;
    
    // Get the base variable value
    try {
      let value = this.resolveInContext(identifier, context);
      
      // Process fields sequentially
      if (fields && fields.length > 0) {
        for (const field of fields) {
          // Handle different field types
          if (field.type === 'field') {
            // Object property access
            if (typeof value === 'object' && value !== null && field.value in value) {
              value = value[field.value];
            } else {
              throw new MeldResolutionError(`Property ${field.value} not found in object`);
            }
          } else if (field.type === 'index') {
            // Array index access
            const index = typeof field.value === 'number' ? field.value : parseInt(String(field.value), 10);
            
            if (Array.isArray(value)) {
              if (index >= 0 && index < value.length) {
                value = value[index];
              } else {
                throw new MeldResolutionError(`Array index out of bounds: ${index} (length: ${value.length})`);
              }
            } else {
              throw new MeldResolutionError(`Cannot use array index on non-array value`);
            }
          }
        }
      }
      
      return this.formatValue(value);
    } catch (error) {
      logger.error('Error resolving DataVar', {
        error,
        identifier,
        fields
      });
      return undefined;
    }
  }

  private resolveTextContent(node: TextNode, context: ResolutionContext): TextNode {
    // Regex to match variable references in text
    const variableRegex = /\{\{([^{}]+)\}\}/g;
    let content = node.content;
    
    // Only process if transformation is enabled and text contains variable references
    if (context.state?.isTransformationEnabled() && 
        (context.state?.shouldTransform?.('variables') ?? true) &&
        content.includes('{{')) {
      
      const matches = Array.from(content.matchAll(variableRegex));
      
      // Process each variable reference
      for (const match of matches) {
        const fullMatch = match[0];
        const variableName = match[1].trim();
        
        try {
          // Try to resolve the variable
          const resolved = this.resolveInContext(variableName, context);
          
          if (resolved !== undefined) {
            // Replace the variable reference with its resolved value
            content = content.replace(fullMatch, this.formatValue(resolved));
          }
        } catch (error) {
          logger.error('Error resolving variable in text', {
            error,
            variableName,
            fullMatch
          });
        }
      }
    }
    
    return {
      ...node,
      content
    };
  }

  private formatValue(value: any): string {
    if (value === undefined) return '';
    if (value === null) return 'null';
    
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    
    if (Array.isArray(value)) {
      // For arrays, format each item individually
      return value.map(item => this.formatValue(item)).join(', ');
    }
    
    if (typeof value === 'object') {
      // For objects, use JSON.stringify with pretty formatting
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return '[Object]';
      }
    }
    
    return String(value);
  }
}
```

### 2. Enhance OutputService Variable Resolution

Improve the `OutputService.nodeToMarkdown` method to better handle variable references:

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
      
      // Try to get variable value directly from state first
      let value = state.getTextVar(variableName);
      if (value === undefined) {
        // If not found as text variable, try data variable
        value = state.getDataVar(variableName);
      }
      
      // If still not found, try more complex resolution with fields
      if (value === undefined && variableName.includes('.')) {
        // Handle field access like "items.0" or "config.value"
        const [baseVar, ...fieldParts] = variableName.split('.');
        let baseValue = state.getDataVar(baseVar);
        
        if (baseValue !== undefined) {
          try {
            // Process fields sequentially
            for (const field of fieldParts) {
              if (baseValue === null || baseValue === undefined) break;
              
              // Handle numeric indices specially for arrays
              if (/^\d+$/.test(field) && Array.isArray(baseValue)) {
                const index = parseInt(field, 10);
                if (index >= 0 && index < baseValue.length) {
                  baseValue = baseValue[index];
                } else {
                  throw new Error(`Array index out of bounds: ${index}`);
                }
              } else {
                // Regular property access
                if (typeof baseValue === 'object' && baseValue !== null && field in baseValue) {
                  baseValue = baseValue[field];
                } else {
                  throw new Error(`Property ${field} not found in object`);
                }
              }
            }
            
            value = baseValue;
          } catch (error) {
            logger.error('Error resolving field access', {
              baseVar,
              fieldParts,
              error
            });
          }
        }
      }
      
      // Replace the variable reference with its value if found
      if (value !== undefined) {
        // Convert to string appropriately based on type
        const stringValue = typeof value === 'string' ? value :
                            typeof value === 'object' ? JSON.stringify(value) :
                            String(value);
        
        content = content.replace(fullMatch, stringValue);
      }
    }
  }
  
  return content.endsWith('\n') ? content : content + '\n';
}
```

### 3. Ensure Transformation is Properly Enabled

Verify that transformation is correctly enabled in the `StateService`:

```typescript
// In StateService.ts
enableTransformation(options?: TransformationOptions | boolean): void {
  // Log transformation enablement for debugging
  console.log('Enabling transformation', {
    options,
    currentState: this._transformationEnabled
  });
  
  if (typeof options === 'boolean') {
    // Legacy behavior - all on or all off
    this._transformationEnabled = options;
    this._transformationOptions = options ? 
      { variables: true, directives: true, commands: true, imports: true } : 
      { variables: false, directives: false, commands: false, imports: false };
  } else {
    // Selective transformation with defined options
    this._transformationEnabled = true;
    this._transformationOptions = {
      ...{ variables: true, directives: true, commands: true, imports: true },
      ...options
    };
  }

  // Initialize transformed nodes with current nodes when enabling transformation
  if (this._transformationEnabled && !this.currentState.transformedNodes) {
    this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
  }
  
  // Log result for debugging
  console.log('Transformation enabled result', {
    enabled: this._transformationEnabled,
    options: this._transformationOptions,
    hasTransformedNodes: !!this.currentState.transformedNodes
  });
}
```

## Debugging Approaches

### 1. Check Variable Availability

To verify that variables are available in the state:

```typescript
// In your test or code
console.log('Available text variables:', 
  Array.from(context.services.state.getAllTextVars().entries()));
console.log('Available data variables:',
  Array.from(context.services.state.getAllDataVars().entries()));

// Check specific variable
const greeting = context.services.state.getTextVar('greeting');
console.log('Variable value:', greeting);
```

### 2. Trace Variable Resolution

To trace how variables are being resolved:

```typescript
// In VariableReferenceResolver or test code
console.log('Resolving variable:', {
  identifier,
  type: 'text', // or 'data'
  hasState: !!context.state,
  transformationEnabled: context.state?.isTransformationEnabled(),
  transformOptions: context.state?.getTransformationOptions()
});

// After looking up variable
console.log('Variable lookup result:', {
  identifier,
  value,
  found: value !== undefined
});
```

### 3. Debug Array and Object Access

For debugging field access issues:

```typescript
// For array access
const array = context.services.state.getDataVar('items');
console.log('Array value:', array);
console.log('Array access with index 0:', array?.[0]);
console.log('Array access with string index "0":', array?.['0']);

// For object access
const obj = context.services.state.getDataVar('config');
console.log('Object value:', obj);
console.log('Object access with property:', obj?.value);
```

### 4. Create a Minimal Test Case

When debugging variable resolution issues, create a minimal test case:

```typescript
it('DEBUG: variable resolution', async () => {
  // Set up simple variables
  context.fs.writeFileSync('test.meld', `
    @text greeting = "Hello"
    @data items = ["apple", "banana", "cherry"]
    
    Text variable: {{greeting}}
    Array access: {{items.0}}
  `);
  
  // Run with transformation enabled
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: true
  });
  
  // Debug info
  console.log('Result:', result);
  console.log('Has greeting:', !!context.services.state.getTextVar('greeting'));
  console.log('greeting value:', context.services.state.getTextVar('greeting'));
  console.log('Has items:', !!context.services.state.getDataVar('items'));
  console.log('items value:', context.services.state.getDataVar('items'));
  
  // Verify results
  expect(result).toContain('Text variable: Hello');
  expect(result).toContain('Array access: apple');
});
```

## Key Lessons and Testing Patterns

1. **Always Check Transformation Enablement**: Verify that transformation is properly enabled:
   ```typescript
   console.log('Transformation enabled:', state.isTransformationEnabled());
   console.log('Transformation options:', state.getTransformationOptions());
   ```

2. **Test Different Variable Types**: Create tests for different variable types and access patterns:
   ```typescript
   // Test simple text variable
   context.fs.writeFileSync('test.meld', `
     @text greeting = "Hello"
     {{greeting}}
   `);
   
   // Test data variable with property access
   context.fs.writeFileSync('test.meld', `
     @data config = { "value": 123 }
     {{config.value}}
   `);
   
   // Test array access with dot notation
   context.fs.writeFileSync('test.meld', `
     @data items = ["apple", "banana"]
     {{items.0}}
   `);
   
   // Test array access with nested objects
   context.fs.writeFileSync('test.meld', `
     @data users = [{ "name": "Alice" }]
     {{users.0.name}}
   `);
   ```

3. **Test Variable Resolution in Text**: Verify that variables within text are properly resolved:
   ```typescript
   context.fs.writeFileSync('test.meld', `
     @text greeting = "Hello"
     @text subject = "World"
     ${greeting}, ${subject}!
   `);
   
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   });
   
   expect(result.trim()).toBe('Hello, World!');
   ```

4. **Validate Field Access Behavior**: Test how field access works with different notations:
   ```typescript
   // Test both notations for arrays
   context.fs.writeFileSync('test.meld', `
     @data items = ["apple", "banana"]
     Dot notation: {{items.0}}
     Bracket notation: {{items[0]}}
   `);
   
   const result = await main('test.meld', {
     fs: context.fs,
     services: context.services,
     transformation: true
   });
   
   expect(result).toContain('Dot notation: apple');
   expect(result).toContain('Bracket notation: apple');
   ```

5. **Check Error Handling**: Test how error conditions are handled:
   ```typescript
   // Test out-of-bounds array access
   context.fs.writeFileSync('test.meld', `
     @data items = ["apple"]
     {{items.99}}
   `);
   
   // Test nonexistent variable
   context.fs.writeFileSync('test.meld', `
     {{missing}}
   `);
   
   // Test nonexistent property
   context.fs.writeFileSync('test.meld', `
     @data config = { "value": 123 }
     {{config.missing}}
   `);
   ``` 