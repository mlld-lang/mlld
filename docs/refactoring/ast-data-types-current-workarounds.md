# AST Data Types: Current Workarounds

## Overview

This document describes the current inconsistencies in how mlld handles data types (objects, arrays, primitives) in the AST and the workarounds we use to handle these inconsistencies. This is technical debt that should eventually be addressed by implementing the plan in `ast-data-types-ideal-implementation.md`.

## The Core Problem

mlld's AST has an inconsistent representation of data values:

1. **Most AST nodes** have a `type` property that identifies what kind of node they are
2. **Data values in certain contexts** are stored as plain JavaScript objects without type metadata

### Example of the Inconsistency

```javascript
// Top-level object assignment - has type metadata
/var @obj = {"name": "alice"}
// AST: { type: 'object', properties: { name: {...} }, location: {...} }

// Object inside array - NO type metadata
/var @arr = [{"name": "alice"}]
// AST: { type: 'array', items: [{"name": {...}}] }  // inner object has no 'type'
```

## Where This Happens

### 1. Objects in Arrays
When parsing array literals, objects inside become plain JS objects:
```mlld
/var @users = [
  {"name": "alice", "id": 1},  // These objects have no 'type' property
  {"name": "bob", "id": 2}
]
```

### 2. Nested Data Structures
Any deeply nested objects or arrays may lose type metadata:
```mlld
/var @data = {
  "users": [{"name": "alice"}],  // Inner object has no type
  "config": {"theme": "dark"}     // This might have type, depending on context
}
```

### 3. Primitive Values
Primitives (strings, numbers, booleans, null) sometimes have wrapper objects, sometimes don't:
```mlld
/var @str = "hello"     // Might be wrapped or plain string
/var @num = 42          // Plain number
/var @arr = ["hello"]   // String might be wrapped with 'wrapperType'
```

## Current Workarounds

### 1. Defensive Type Checking (evaluateArrayItem in var.ts)

```typescript
async function evaluateArrayItem(item: any, env: Environment): Promise<any> {
  // Handle wrapped strings
  if ('content' in item && Array.isArray(item.content) && 'wrapperType' in item) {
    return await interpolate(item.content, env);
  }
  
  // Handle Text nodes
  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }
  
  // Handle objects without type property (THE WORKAROUND)
  if (!item.type && typeof item === 'object' && item.constructor === Object) {
    const nestedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      nestedObj[key] = await evaluateArrayItem(value, env);
    }
    return nestedObj;
  }
  
  // Handle properly typed nodes
  switch (item.type) {
    case 'array': // ...
    case 'object': // ...
    // etc.
  }
}
```

### 2. Multiple JSON Replacers (ast-evaluation.ts)

We need a custom JSON replacer that handles both typed and untyped nodes:

```typescript
export function createASTAwareJSONReplacer() {
  return (key: string, val: any): any => {
    // Handle wrapped strings (with wrapperType)
    if (val && typeof val === 'object' && 'wrapperType' in val && 'content' in val) {
      if (val.content.length > 0 && val.content[0].type === 'Text') {
        return val.content[0].content;
      }
    }
    
    // Handle raw Text nodes
    if (val && typeof val === 'object' && val.type === 'Text' && 'content' in val) {
      return val.content;
    }
    
    // ... more cases
  };
}
```

### 3. Type Existence Checks (lazy-eval.ts)

```typescript
// Handle plain objects (from parsed data)
if (typeof value === 'object' && value !== null && !value.type) {
  // This is a plain object without type metadata
  const evaluatedObject: Record<string, any> = {};
  // ... handle it specially
}
```

### 4. Complex vs Simple Detection

We have to guess whether data needs lazy evaluation:

```typescript
function hasComplexArrayItems(items: any[]): boolean {
  for (const item of items) {
    if (item && typeof item === 'object') {
      if ('type' in item && (
        item.type === 'code' || 
        item.type === 'command' || 
        item.type === 'VariableReference' ||
        // ... check for all possible mlld expressions
      )) {
        return true;
      }
    }
  }
  return false;
}
```

## Why These Workarounds Exist

1. **Historical Evolution**: The grammar evolved organically, and data parsing was added incrementally
2. **Peggy Limitations**: Peggy naturally returns parsed values, not wrapped AST nodes
3. **Performance Concerns**: Wrapping every value in type metadata adds overhead
4. **Complexity of mlld-in-data**: Objects can contain mlld expressions, not just JSON

## Problems Caused by This Inconsistency

1. **Bug-Prone**: Easy to forget to handle untyped nodes (like the string-in-array bug)
2. **Code Duplication**: Same logic repeated in multiple places with slight variations
3. **Maintenance Burden**: New developers must learn about both typed and untyped nodes
4. **Type Safety**: TypeScript can't help us when nodes might or might not have types
5. **Performance**: Extra runtime checks to determine node types

## Current Best Practices

When working with data values in mlld:

1. **Always check for type property**: Never assume `node.type` exists
2. **Handle both cases**: Write code that works with both typed and untyped nodes
3. **Use the shared replacer**: Import `createASTAwareJSONReplacer` for JSON serialization
4. **Test extensively**: Include test cases with nested data structures
5. **Document assumptions**: Comment when you're handling typed vs untyped nodes

## Related Files

- `/interpreter/eval/var.ts` - Contains `evaluateArrayItem` with workarounds
- `/interpreter/eval/lazy-eval.ts` - Contains `evaluateDataValue` with type checks
- `/interpreter/utils/ast-evaluation.ts` - Shared JSON replacer
- `/interpreter/eval/show.ts` - Uses JSON replacer for output
- `/interpreter/core/interpreter.ts` - Uses JSON replacer in interpolation

## See Also

- `ast-data-types-ideal-implementation.md` - Plan to fix this properly
- `ast-evaluation-consolidation.md` - Related refactoring effort