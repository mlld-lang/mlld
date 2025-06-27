# AST Refactor Phase 1: ASTEvaluator for Arrays

## Goal

Create a minimal `ASTEvaluator` class that normalizes array values to have consistent type information, fixing issues with array functions like filter, groupBy, and find.

## Scope

- Create `ASTEvaluator` class with array normalization
- Update array evaluation in critical paths
- Fix known array function bugs
- Add tests to verify normalization

## Implementation Plan

### 1. Create ASTEvaluator Class

**File**: `interpreter/core/ast-evaluator.ts`

```typescript
import { Environment } from '../env/Environment';

export interface ArrayNode {
  type: 'array';
  items: any[];
  location: SourceLocation | { synthetic: boolean };
}

export class ASTEvaluator {
  /**
   * Normalize an array value to have consistent type information
   */
  static normalizeArray(value: any): ArrayNode {
    // Already normalized
    if (value && typeof value === 'object' && value.type === 'array') {
      return value;
    }
    
    // Plain JavaScript array - synthesize type information
    if (Array.isArray(value)) {
      return {
        type: 'array',
        items: value.map(item => this.normalizeValue(item)),
        location: { synthetic: true }
      };
    }
    
    throw new Error(`Expected array, got ${typeof value}`);
  }
  
  /**
   * Normalize any value (minimal for Phase 1)
   */
  static normalizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    if (Array.isArray(value)) {
      return this.normalizeArray(value);
    }
    
    // For Phase 1, only normalize arrays
    // Objects and other types pass through unchanged
    return value;
  }
  
  /**
   * Evaluate a value to runtime representation
   * Phase 1: Focus on arrays
   */
  static async evaluateToRuntime(value: any, env: Environment): Promise<any> {
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle arrays
    if (Array.isArray(value) || (value.type === 'array')) {
      const normalized = this.normalizeArray(value);
      const evaluatedItems = [];
      
      for (const item of normalized.items) {
        // Use existing evaluation logic
        const { evaluateDataValue } = await import('../eval/lazy-eval');
        evaluatedItems.push(await evaluateDataValue(item, env));
      }
      
      return evaluatedItems;
    }
    
    // For Phase 1, delegate non-arrays to existing logic
    const { evaluateDataValue } = await import('../eval/lazy-eval');
    return evaluateDataValue(value, env);
  }
}
```

### 2. Update Array Module Functions

**File**: `modules/mlld/array/index.mld`

Update functions that are failing due to AST nodes:

```typescript
// In filter implementation
const normalizedArray = await ASTEvaluator.evaluateToRuntime(arrayValue, env);

// In groupBy implementation  
const normalizedArray = await ASTEvaluator.evaluateToRuntime(arrayValue, env);

// In find implementation
const normalizedArray = await ASTEvaluator.evaluateToRuntime(arrayValue, env);
```

### 3. Update Critical Array Evaluation Paths

**Locations to update**:
- `interpreter/eval/var.ts` - When creating array variables
- `interpreter/eval/lazy-eval.ts` - Array evaluation
- `interpreter/eval/foreach.ts` - Foreach with arrays

### 4. Add Tests

**File**: `tests/ast-evaluator/arrays.test.ts`

```typescript
describe('ASTEvaluator - Arrays', () => {
  it('should normalize plain arrays', () => {
    const plain = [1, 2, 3];
    const normalized = ASTEvaluator.normalizeArray(plain);
    expect(normalized).toEqual({
      type: 'array',
      items: [1, 2, 3],
      location: { synthetic: true }
    });
  });
  
  it('should handle already-normalized arrays', () => {
    const typed = { type: 'array', items: [1, 2, 3], location: {...} };
    const normalized = ASTEvaluator.normalizeArray(typed);
    expect(normalized).toBe(typed); // Same reference
  });
  
  it('should fix filter with string comparison', async () => {
    const users = [
      { name: "alice", dept: "eng" },
      { name: "bob", dept: "sales" }
    ];
    const result = await ASTEvaluator.evaluateToRuntime(users, env);
    // Result should be plain JS objects, not AST nodes
    expect(result[0].name).toBe("alice"); // Not a wrapped string
  });
});
```

## Success Criteria

1. Array functions (filter, groupBy, find) work with string fields
2. No AST nodes appear in array function outputs
3. Tests pass for array normalization
4. No regression in existing array functionality

## Next Steps

After Phase 1 is complete and tested, move to Phase 2 (object normalization).