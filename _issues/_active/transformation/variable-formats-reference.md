# Variable Reference Formats - Implementation Guide

This document provides a quick reference for the different ways variable references appear in the Meld AST, and how they should be handled during resolution and transformation.

## Basic Variable References

### Text Variables

```
Input:      {{greeting}}
AST Type:   TextVar
Structure:  {
              "type": "TextVar",
              "identifier": "greeting",
              "varType": "text",
              "location": {...}
            }
Resolution: Return the value of the variable directly
Example:    {{greeting}} → "Hello World"
```

### Data Variables with Field Access

```
Input:      {{config.value}}
AST Type:   DataVar
Structure:  {
              "type": "DataVar",
              "identifier": "config",
              "varType": "data",
              "fields": [
                {
                  "type": "field",
                  "value": "value"
                }
              ],
              "location": {...}
            }
Resolution: Retrieve the base variable, then access the field
Example:    config = { value: 123 } → {{config.value}} → "123"
```

### Data Variables with Multiple Fields

```
Input:      {{config.nested.key}}
AST Type:   DataVar
Structure:  {
              "type": "DataVar",
              "identifier": "config",
              "varType": "data",
              "fields": [
                {
                  "type": "field",
                  "value": "nested"
                },
                {
                  "type": "field",
                  "value": "key"
                }
              ],
              "location": {...}
            }
Resolution: Access fields sequentially, starting with the base variable
Example:    config = { nested: { key: "secret" } } → {{config.nested.key}} → "secret"
```

## Array Access Patterns

### Bracket Notation

```
Input:      {{items[0]}}
AST Type:   DataVar
Structure:  {
              "type": "DataVar",
              "identifier": "items",
              "varType": "data",
              "fields": [
                {
                  "type": "index",
                  "value": 0
                }
              ],
              "location": {...}
            }
Resolution: Access the index of the array
Example:    items = ["apple", "banana"] → {{items[0]}} → "apple"
```

### Dot Notation

```
Input:      {{items.0}}
AST Type:   DataVar
Structure:  {
              "type": "DataVar",
              "identifier": "items",
              "varType": "data",
              "fields": [
                {
                  "type": "index",
                  "value": 0
                }
              ],
              "location": {...}
            }
Resolution: Identical to bracket notation in the AST!
Example:    items = ["apple", "banana"] → {{items.0}} → "apple"
```

### Nested Array and Object Access

```
Input:      {{users[0].name}}
AST Type:   DataVar
Structure:  {
              "type": "DataVar",
              "identifier": "users",
              "varType": "data",
              "fields": [
                {
                  "type": "index",
                  "value": 0
                },
                {
                  "type": "field",
                  "value": "name"
                }
              ],
              "location": {...}
            }
Resolution: Access array index first, then field
Example:    users = [{ name: "Alice" }] → {{users[0].name}} → "Alice"
```

## Implementation Considerations

### Field Type Detection

The AST uses different types for field access:
- `"type": "field"` - For object property access
- `"type": "index"` - For array index access

But both should be handled similarly in JavaScript: `value[field.value]`

### String Formatting

When resolving complex objects or arrays, appropriate string formatting should be applied:

1. **Primitive values** (string, number, boolean): Convert directly to string
2. **Objects**: Format as JSON or user-friendly representation
3. **Arrays**: Format individual elements, join with commas or other delimiters

### Resolution Process

For any variable reference:

1. Lookup the base variable by identifier
2. If fields are present, traverse them sequentially
3. Convert the final value to an appropriate string representation
4. Replace the variable node with a text node containing the string value

## Improved Implementation Pattern

Using a normalized approach to variable resolution:

```typescript
function resolveVariable(node: MeldNode, context: ResolutionContext): string {
  // Handle different node types
  const identifier = node.type === 'TextVar' || node.type === 'DataVar' 
    ? node.identifier 
    : undefined;
    
  const fields = node.type === 'DataVar' ? node.fields : [];
  
  if (!identifier) return node.toString(); // Fallback to standard string representation
  
  // Get base value
  let value = context.getVariable(identifier);
  if (value === undefined) return `{{${identifier}}}`;  // Unresolved variable
  
  // Process fields if present
  if (fields && fields.length > 0) {
    try {
      for (const field of fields) {
        if (value === undefined) break;
        value = value[field.value];
      }
    } catch (err) {
      return `{{Error accessing ${identifier}}}`;
    }
  }
  
  // Format final value
  return formatValue(value);
}

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  
  if (Array.isArray(value)) {
    // For arrays, format each item individually
    return value.map(formatValue).join(', ');
  }
  
  if (typeof value === 'object') {
    // For objects, use a more readable format than raw JSON
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return '[Object]';
    }
  }
  
  return String(value);
}
```

This approach handles all variable reference formats consistently while providing appropriate string formatting for complex data structures. 