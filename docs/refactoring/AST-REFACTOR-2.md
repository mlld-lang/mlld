# AST Refactor Phase 2: ASTEvaluator for Objects

## Goal

Extend `ASTEvaluator` to handle object normalization, covering all contexts where objects appear in mlld.

## Scope

- Extend ASTEvaluator for object normalization
- Update object evaluation in all contexts
- Handle special object types (namespaces, executables)
- Update field access to work with normalized objects

## Implementation Plan

### 1. Extend ASTEvaluator for Objects

**File**: `interpreter/core/ast-evaluator.ts`

```typescript
export interface ObjectNode {
  type: 'object';
  properties: Record<string, any>;
  location: SourceLocation | { synthetic: boolean };
}

// Add to ASTEvaluator class:

/**
 * Normalize an object value to have consistent type information
 */
static normalizeObject(value: any): ObjectNode {
  // Already normalized
  if (value && typeof value === 'object' && value.type === 'object') {
    return value;
  }
  
  // Plain JavaScript object - synthesize type information
  if (typeof value === 'object' && value !== null && value.constructor === Object) {
    const properties: Record<string, any> = {};
    
    for (const [key, val] of Object.entries(value)) {
      // Skip internal properties
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      properties[key] = this.normalizeValue(val);
    }
    
    return {
      type: 'object',
      properties,
      location: { synthetic: true }
    };
  }
  
  throw new Error(`Expected object, got ${typeof value}`);
}

// Update normalizeValue:
static normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (Array.isArray(value)) {
    return this.normalizeArray(value);
  }
  
  if (typeof value === 'object' && value.constructor === Object && !value.type) {
    return this.normalizeObject(value);
  }
  
  // Primitives and already-typed nodes pass through
  return value;
}
```

### 2. Update Object Evaluation Contexts

**Key locations**:

#### 2.1 Variable Assignment
**File**: `interpreter/eval/var.ts`
- Update object creation in var assignment
- Handle nested objects in data structures

#### 2.2 Namespace Objects
**File**: `interpreter/eval/import.ts`
- Normalize namespace objects for consistent access
- Special handling for `isNamespace` metadata

#### 2.3 Shadow Environments
**File**: `interpreter/eval/exe.ts`
- `/exe js = { func1, func2 }` creates special objects
- Need to preserve executable nature while normalizing

#### 2.4 Module Exports
**File**: `interpreter/core/module-loader.ts`
- Module exports are objects that need normalization
- Preserve module metadata

### 3. Update Field Access

**File**: `interpreter/utils/field-access.ts`

```typescript
export async function accessField(value: any, field: FieldAccessNode): Promise<any> {
  // Normalize object before field access
  const normalized = ASTEvaluator.normalizeValue(value);
  
  if (normalized.type === 'object') {
    const fieldName = field.value;
    return normalized.properties[fieldName];
  }
  
  // Handle other cases...
}
```

### 4. Handle Special Cases

#### 4.1 Wrapped Strings in Objects
Objects often contain wrapped strings that need evaluation:
```typescript
// Handle { name: { content: [{type: 'Text', content: 'alice'}], wrapperType: 'doubleQuote' }}
```

#### 4.2 Executable Objects
Preserve special properties:
```typescript
if (value.__executable) {
  // Special handling to preserve executable nature
}
```

#### 4.3 Path Objects
Path objects have special resolution logic:
```typescript
if (isPathValue(value)) {
  // Preserve path resolution capabilities
}
```

### 5. Add Tests

**File**: `tests/ast-evaluator/objects.test.ts`

```typescript
describe('ASTEvaluator - Objects', () => {
  it('should normalize plain objects', () => {
    const plain = { name: "alice", count: 42 };
    const normalized = ASTEvaluator.normalizeObject(plain);
    expect(normalized).toEqual({
      type: 'object',
      properties: { name: "alice", count: 42 },
      location: { synthetic: true }
    });
  });
  
  it('should handle nested structures', () => {
    const nested = {
      user: { name: "alice" },
      items: [1, 2, 3]
    };
    const normalized = ASTEvaluator.normalizeValue(nested);
    expect(normalized.type).toBe('object');
    expect(normalized.properties.user.type).toBe('object');
    expect(normalized.properties.items.type).toBe('array');
  });
  
  it('should preserve namespace metadata', () => {
    // Test namespace object normalization
  });
  
  it('should handle executable objects', () => {
    // Test shadow environment objects
  });
});
```

## Success Criteria

1. Object field access works consistently
2. Namespace imports work with normalized objects
3. Shadow environments preserve functionality
4. No regression in object operations
5. Tests pass for object normalization

## Complexity Notes

Objects are more complex than arrays because:
1. They appear in more contexts (namespaces, modules, data)
2. They have special subtypes (executable, path, namespace)
3. Field access is a critical operation
4. They can contain mlld expressions as values

## Next Steps

After Phase 2, move to Phase 3 (Grammar Output Tests) to define the target AST structure.