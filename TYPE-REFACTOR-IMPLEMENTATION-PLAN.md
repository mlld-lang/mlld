# Type Refactor Implementation Plan

Based on our Phase 0 audit, here's the concrete implementation plan for enhancing the Variable metadata system to fix type detection issues.

## Current State Verification

✅ **Array Bug Fixed**: Complex arrays now display correctly in templates
✅ **Tests Pass**: `Mixed array: ["Hello","12:00 PM"]` works as expected
✅ **Understanding Complete**: We know why special classes exist and what behaviors to preserve

## Phase 1 Implementation Steps

### Step 1: Enhance VariableMetadata (Non-Breaking) ✅ COMPLETED

**Status**: Completed in commit `acee533c`
**File**: `core/types/variable/VariableTypes.ts` (enhanced existing interface)

**What was done**:
- Enhanced the existing `VariableMetadata` interface in `VariableTypes.ts`
- Added all planned metadata fields for behavior preservation
- Interface already extends `Record<string, any>` so changes are non-breaking
- All new fields are optional (using `?:`)
- Tests confirmed: 270 tests pass, 0 failures

**Fields added**:
```typescript
// Added to existing VariableMetadata interface:
  
  // Array-specific metadata
  arrayType?: 'renamed-content' | 'load-content-result' | 'regular';
  joinSeparator?: string; // '\n\n' for special arrays
  
  // Behavior preservation
  customToString?: () => string;
  customToJSON?: () => any;
  contentGetter?: () => string;
  
  // Content loading metadata
  fromGlobPattern?: boolean;
  globPattern?: string;
  fileCount?: number;
  
  // Header transformation metadata
  headerTransform?: {
    applied: boolean;
    template: string;
  };
  
  // Namespace metadata
  isNamespace?: boolean;
  
  // Template metadata
  templateAst?: any[]; // For lazy-evaluated templates
```

**Key Learning**: The metadata was added directly to `VariableTypes.ts` rather than creating a separate file, since the `VariableMetadata` interface already existed there.

### Step 2: Update Content Loader to Create Variables

**File**: `interpreter/eval/content-loader.ts`

Instead of returning special array classes, return Variables with metadata:

```typescript
// At the end of loadGlobPattern function
if (options?.section?.renamed) {
  // Instead of: return createRenamedContentArray(results as string[]);
  
  const arrayValue = results as string[];
  
  // Create ArrayVariable with special metadata
  const variable: ArrayVariable = {
    type: 'array',
    name: 'glob-result',
    value: arrayValue,
    source: {
      directive: 'var',
      syntax: 'array',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {
      arrayType: 'renamed-content',
      joinSeparator: '\n\n',
      customToString: () => arrayValue.join('\n\n'),
      fromGlobPattern: true,
      globPattern: pattern,
      fileCount: arrayValue.length
    }
  };
  
  // For now, still return the special class but tag it
  const renamedArray = createRenamedContentArray(arrayValue);
  Object.defineProperty(renamedArray, '__variable', {
    value: variable,
    enumerable: false
  });
  
  return renamedArray;
}
```

### Step 3: Fix Type Guards to Use Metadata

**File**: `core/types/load-content.ts`

```typescript
export function isRenamedContentArray(value: unknown): value is RenamedContentArray {
  // Check for tagged Variable first
  const variable = (value as any)?.__variable;
  if (variable && variable.type === 'array' && variable.metadata?.arrayType === 'renamed-content') {
    return true;
  }
  
  // Fallback to instanceof for backward compatibility
  if (value instanceof RenamedContentArray) {
    return true;
  }
  
  // REMOVE the broken content-based check
  // DO NOT: return Array.isArray(value) && value.every(item => typeof item === 'string');
  
  return false;
}
```

### Step 4: Update Interpreter to Check Variable Metadata

**File**: `interpreter/core/interpreter.ts`

In the interpolation logic where we check for RenamedContentArray:

```typescript
// Around line 350-355
} else if (isRenamedContentArray(value) && 'content' in value) {
  // For RenamedContentArray, use its .content getter
  stringValue = value.content;
} else if ((value as any)?.__variable?.metadata?.arrayType === 'renamed-content') {
  // New: Check Variable metadata
  stringValue = (value as string[]).join('\n\n');
} else if (Array.isArray(value)) {
  // Regular arrays use JSON
  stringValue = JSON.stringify(value);
}
```

### Step 5: Create Migration Helper

**File**: `interpreter/utils/variable-migration.ts`

```typescript
/**
 * Helper to preserve special behaviors when extracting Variable values
 */
export function extractVariableValue(variable: Variable): any {
  let value = variable.value;
  
  // For arrays with custom toString
  if (variable.type === 'array' && variable.metadata?.customToString) {
    if (Array.isArray(value)) {
      Object.defineProperty(value, 'toString', {
        value: variable.metadata.customToString,
        enumerable: false
      });
    }
  }
  
  // Tag with original Variable for type recovery
  if (value !== null && typeof value === 'object') {
    Object.defineProperty(value, '__variable', {
      value: variable,
      enumerable: false
    });
  }
  
  return value;
}
```

## Testing Plan

1. **Unit Tests**: Create tests for each new function
2. **Integration Tests**: Verify glob patterns still work
3. **Regression Tests**: Run full test suite
4. **Manual Tests**: Test with real mlld scripts using renamed sections

## Rollout Strategy

1. **Phase 1a**: Add metadata fields and tagging (no behavior changes)
2. **Phase 1b**: Update type guards to check metadata first
3. **Phase 1c**: Start creating Variables in content-loader
4. **Phase 1d**: Gradually migrate other special types

## Success Metrics

- ✅ No test failures
- ✅ isRenamedContentArray becomes reliable
- ✅ Special toString() behaviors preserved
- ✅ Foundation for broader type preservation

## Risks and Mitigations

**Risk**: Breaking existing code that depends on instanceof checks
**Mitigation**: Keep instanceof as fallback, only add metadata checks

**Risk**: Performance impact from metadata
**Mitigation**: Use lazy getters, minimal overhead

**Risk**: Complexity increase
**Mitigation**: Actually reduces complexity by removing guessing

## Progress Summary

### Completed:
- ✅ **Phase 1 Step 1**: Enhanced VariableMetadata (commit `acee533c`)
  - All metadata fields added to support behavior preservation
  - Non-breaking change confirmed (270 tests pass)

### Phase 1: COMPLETED ✅

#### Step 1: Enhanced VariableMetadata (commit `acee533c`)
- ✅ All metadata fields added to support behavior preservation
- ✅ Non-breaking change confirmed (270 tests pass)

#### Step 2: Updated Content Loader to tag arrays (commit `d8f71882`)
- ✅ Modified `content-loader.ts` to tag special arrays with `__variable` property
- ✅ Arrays from `createRenamedContentArray` and `createLoadContentResultArray` now include Variable metadata
- ✅ Updated `var.ts` to preserve metadata when creating Variables from tagged arrays
- ✅ All 808 tests pass - backward compatibility maintained

#### Step 3: Fixed Type Guards to Use Metadata (commit `8550015e`)
- ✅ Updated `isRenamedContentArray` to check `__variable.metadata.arrayType` first
- ✅ Added fallback to instanceof for backward compatibility
- ✅ Removed broken content-based check that was too generic
- ✅ Added comprehensive tests for all type guards
- ✅ All 818 tests pass

## Phase 2: Migrate Special Classes to Variables ✅ COMPLETED

Successfully migrated from special array classes to Variables with full behavior preservation.

### Step 1: Created Migration Helper ✅
**File**: `interpreter/utils/variable-migration.ts`

Key functions implemented:
- `extractVariableValue()` - Extracts value while preserving behaviors via defineProperty
- `createRenamedContentVariable()` - Creates Variable with RenamedContentArray behavior
- `createLoadContentResultVariable()` - Creates Variable with LoadContentResultArray behavior
- Helper functions: `hasVariableMetadata()`, `getVariableMetadata()`

### Step 2: Updated Content Loader ✅
**File**: `interpreter/eval/content-loader.ts`

Changes:
- Removed imports of deprecated factory functions
- Now uses `createRenamedContentVariable()` for renamed sections
- Now uses `createLoadContentResultVariable()` for glob results
- Arrays are extracted with behaviors preserved via `extractVariableValue()`

### Step 3: Updated Consumers ✅
**Files**: `core/types/load-content.ts`

Type guards updated:
- `isRenamedContentArray` - Checks `__variable.metadata.arrayType` first
- `isLoadContentResultArray` - Checks `__variable.metadata.arrayType` first
- Removed dependency on factory function imports
- Added fallback behavior detection for untagged arrays

### Step 4: Deprecated Special Classes ✅
**File**: `interpreter/eval/load-content.ts`

Status:
- Factory functions marked with `@deprecated`
- Still exist for backward compatibility
- No longer imported or used anywhere
- Can be removed in Phase 5

### Results
- All 821 tests passing
- Zero breaking changes
- Type detection now O(1) via metadata
- Foundation laid for broader Variable flow

## Phase 3: Update Core Resolution 🚀 NEXT

**Goal**: Make Variables flow through the interpreter instead of extracting values early.

### Step 1: Document Resolution Points
Create `RESOLUTION-POINTS.md` mapping where values are extracted:

**Key areas to investigate**:
```typescript
// 1. Variable resolution in interpreter
resolveVariableValue(variable: Variable): any  // Should return Variable

// 2. Template interpolation
interpolate(nodes: any[], env: Environment): Promise<string>  // Extract only at end

// 3. Array/object evaluation
evaluateArrayItem(item: any, env: Environment): Promise<any>  // Preserve Variables

// 4. Command execution
executeCommand(cmd: string, env: Environment): Promise<string>  // May need values
```

### Step 2: Design Variable Flow Rules

**When to preserve Variables**:
- Variable-to-variable assignment
- Array/object member storage
- Function parameter passing
- Cross-file imports

**When to extract values**:
- String interpolation (final output)
- Command execution (shell needs strings)
- File I/O operations
- External API calls

### Step 3: Update Core Functions

**Priority order**:
1. `resolveVariableValue()` - Return Variables instead of values
2. `evaluateArrayItem()` - Preserve Variable wrappers
3. `interpolate()` - Extract only when building final string
4. Variable assignment in `var.ts` - Already handles Variables well

### Step 4: Handle Edge Cases

**Complex scenarios**:
- Variables containing Variables
- Lazy evaluation preservation
- Circular reference detection
- Performance optimization

### Success Metrics
- Type information available deeper in call stack
- Better error messages with actual types
- No performance degradation
- All tests continue passing