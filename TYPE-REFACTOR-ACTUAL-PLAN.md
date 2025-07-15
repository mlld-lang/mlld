# Type System Refactor: Preserve Variables Through Transformation

## Executive Summary

mlld has a sophisticated Variable type system that preserves type information, but we systematically discard this information by extracting raw JavaScript values during evaluation. This creates complexity, bugs, and forces us to "guess" types based on content rather than using the type information we already have.

**Goal**: Make Variables flow through the entire system, preserving their type discriminators and metadata, while maintaining ALL existing behaviors through a careful, documented migration.

## Background: The Problem

### Current State
```typescript
// We start with a typed Variable:
const pathVariable: PathVariable = {
  type: 'path',  // <-- This discriminator tells us everything!
  value: {
    resolvedPath: '/Users/adam/file.md',
    originalPath: './file.md',
    isURL: false
  },
  metadata: { /* source, etc. */ }
};

// But then we throw it away:
function resolveVariableValue(variable: Variable): any {
  if (isPath(variable)) {
    return variable.value.resolvedPath;  // Now just a string!
  }
}

// Later, we have to guess what type it was:
if (typeof value === 'string' && value.startsWith('/')) {
  // Maybe a path? Who knows!
}
```

### The Bug That Started This
```typescript
// This type guard is too broad:
function isRenamedContentArray(value: unknown): value is RenamedContentArray {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

// It matches ANY string array!
const regularArray = ['hello', 'world'];
isRenamedContentArray(regularArray); // true - WRONG!
```

### The Deeper Issue
We found **388+ instances** of ad-hoc type checking (`typeof`, `instanceof`, `Array.isArray`) because we're throwing away our Variable types and trying to guess them back.

## CRITICAL: Chesterton's Fence Approach

### What is Chesterton's Fence?
"Don't tear down a fence until you understand why it was built." Every special class, every behavior, every seeming complexity exists for a reason. We MUST understand before changing.

### Special Behaviors We MUST Understand First

1. **RenamedContentArray** 
   ```typescript
   class RenamedContentArray extends Array<string> {
     toString(): string { return this.join('\n\n'); }
   }
   ```
   - **Why it exists**: When loading `<**/*.md # Section> as "### New Title"`, sections from multiple files need special joining
   - **What breaks if removed**: Content would be joined with commas instead of double newlines
   - **Used by**: Glob patterns with section extraction, foreach operations

2. **LoadContentResultArray**
   ```typescript
   class LoadContentResultArray extends Array<LoadContentResult> {
     toString(): string { return this.map(item => item.content).join('\n\n'); }
     get content(): string { return this.toString(); }
   }
   ```
   - **Why it exists**: Provides convenient access to concatenated content while preserving metadata
   - **What breaks if removed**: Templates using `<*.md>.content` would fail
   - **Used by**: File loading, glob patterns, template interpolation

3. **Header Transformation Logic**
   ```typescript
   applyHeaderTransform(content: string, newHeader: string): string
   ```
   - **Why it exists**: The `as` clause allows three different transformations:
     - Just level: `as "###"` (changes # to ###)
     - Just text: `as "New Title"` (keeps level, changes text)
     - Both: `as "### New Title"` (replaces whole header)
   - **What breaks if removed**: Section renaming feature completely breaks
   - **Used by**: `as` clause in var, show, and content loading

4. **Complex vs Simple Arrays**
   - **Why it exists**: Arrays containing AST nodes (variable references, function calls) need lazy evaluation
   - **What breaks if removed**: Arrays like `[@var1, @func()]` would evaluate immediately instead of when accessed
   - **Used by**: Variable creation, template evaluation

### Documentation Requirements Before ANY Changes

For each special type/behavior, document:
1. **Purpose**: Why does this exist?
2. **Behavior**: What special things does it do?
3. **Usage**: Where is it used in the codebase?
4. **Creation**: How/where is it created?
5. **Detection**: How do we currently detect it?
6. **Dependencies**: What depends on this behavior?
7. **Test Coverage**: What tests verify this behavior?

## The Solution: Enhance Variables, Don't Fight Them

### Core Principle
**Variables should carry all type information AND behaviors through the entire system.**

### What This Means
1. Keep Variables as Variables as long as possible
2. When we must extract values, preserve behaviors through metadata
3. Use Variable discriminators (`type: 'array'`) not content inspection
4. Document EVERYTHING before changing ANYTHING

## Implementation Plan

### Phase 0: Documentation Audit (MANDATORY FIRST STEP)

**Goal**: Understand every special behavior before touching code.

**Deliverables**:
1. `SPECIAL-BEHAVIORS-AUDIT.md` containing:
   - Every special class and its purpose
   - Every custom behavior (toString, toJSON, getters)
   - Usage patterns and dependencies
   - What breaks if we change it

2. `TYPE-LOSS-LOCATIONS.md` containing:
   - Every place we convert Variable → raw value
   - Why the conversion happens there
   - What type information is lost
   - Impact of preserving the Variable instead

**Success Criteria**: Can explain why every special behavior exists.

### Phase 1: Enhance Variable Metadata System ✅ COMPLETED

**Goal**: Add behavior preservation to Variable metadata.
**Result**: All 3 steps complete (commits: `acee533c`, `d8f71882`, `8550015e`)

**Status**: Step 1 completed (commit `acee533c`) - VariableMetadata enhanced with behavior fields

**Changes**:
```typescript
// Enhance metadata to carry behaviors
interface VariableMetadata {
  // Existing fields...
  
  // For special array types
  arrayType?: 'renamed-content' | 'load-content-result' | 'regular';
  
  // Behavior preservation
  customToString?: () => string;
  customToJSON?: () => any;
  contentGetter?: () => string;
  
  // Array-specific
  joinSeparator?: string;  // '\n\n' for special arrays
  
  // For renamed content
  headerTransform?: {
    applied: boolean;
    template: string;
  };
}
```

**Success Criteria**: Variable metadata can describe all special behaviors.

### Phase 2: Create Behavior-Preserving Extraction

**Goal**: When we must extract values, preserve special behaviors.

**Implementation**:
```typescript
// Smart extraction that preserves behaviors
function extractVariableValue(variable: Variable): any {
  const value = getRawValue(variable);
  
  // Preserve special behaviors
  if (variable.metadata?.customToString) {
    Object.defineProperty(value, 'toString', {
      value: variable.metadata.customToString,
      enumerable: false
    });
  }
  
  // Tag with original Variable for type recovery
  Object.defineProperty(value, '__variable', {
    value: variable,
    enumerable: false
  });
  
  return value;
}
```

**Success Criteria**: Extracted values behave identically to current special classes.

### Phase 3: Update Type Detection (WITHOUT Breaking Existing)

**Goal**: Use Variable metadata for type detection, with fallbacks.

**Implementation**:
```typescript
// New detection uses metadata first, falls back to current logic
function isRenamedContentArray(value: unknown): boolean {
  // Try Variable metadata first
  const variable = value?.__variable;
  if (variable?.type === 'array' && variable.metadata?.arrayType === 'renamed-content') {
    return true;
  }
  
  // Fall back to instanceof for existing code
  if (value instanceof RenamedContentArray) {
    return true;
  }
  
  // DO NOT use the broken content-based check
  return false;
}
```

**Success Criteria**: Both old and new detection methods work.

### Phase 4: Gradual Migration of Special Types

**For EACH special type** (one at a time):

1. **Document** current behavior completely
2. **Add tests** that verify the behavior
3. **Implement** Variable metadata version
4. **Add** behavior preservation to extraction
5. **Update** detection to use metadata
6. **Test** exhaustively with real mlld scripts
7. **Keep** the old class until certain
8. **Remove** old class only after extended testing

**Success Criteria**: Each type migrated without breaking changes.

### Phase 5: Update Core Resolution

**Goal**: Make Variables flow through the system.

**Changes**:
```typescript
// Instead of returning raw values
function resolveVariableValue(variable: Variable): Variable {
  // Return the Variable itself for simple types
  if (isPath(variable) || isText(variable)) {
    return variable;
  }
  
  // For complex types, return new Variable with evaluated value
  if (isComplex(variable)) {
    const evaluatedValue = await evaluateDataValue(variable.value, env);
    return createVariable(variable.type, evaluatedValue, variable.metadata);
  }
}
```

**Success Criteria**: Type information preserved through evaluation chains.

## What We Will NOT Do

1. **Remove behaviors without understanding them** - Every toString() matters
2. **Break existing functionality** - All tests must pass at each phase
3. **Make assumptions** - Document and verify everything
4. **Rush the migration** - Better to be slow and correct

## Success Metrics

- ✅ Zero breaking changes for users
- ✅ All existing tests pass throughout migration
- ✅ Special behaviors preserved (custom toString, etc.)
- ✅ Type detection becomes O(1) property check
- ✅ Reduced code complexity (fewer typeof checks)
- ✅ Better error messages (we know actual types)

## Risk Mitigation

1. **Incremental approach** - Each phase stands alone
2. **Fallback mechanisms** - Old detection still works
3. **Extensive testing** - Real mlld scripts at each step
4. **Reversibility** - Can roll back any phase
5. **Documentation first** - Understand before changing

## For the Next Session

**CURRENT STATUS**: Phase 1 ✅ COMPLETE | Phase 2 🚀 Next

Phase 1 successfully completed:
- Step 1: Enhanced VariableMetadata with behavior preservation fields
- Step 2: Tagged special arrays with __variable metadata 
- Step 3: Updated type guards to check metadata first
- All 818 tests passing

Next: Phase 2 - Migrate special classes to Variables directly

**Critical files for Step 2**:
- `interpreter/eval/content-loader.ts` - Where to add Variable creation/tagging
- `interpreter/eval/load-content-impl.ts` - Special array classes to understand
- Look for: `createRenamedContentArray` and `LoadContentResultArray` usage

**Test with these scenarios**:
- Glob patterns with renamed sections (tests/cases/valid/alligator/)
- Verify special toString() behaviors still work
- Confirm arrays are tagged with `__variable` property

**Success criteria for Step 2**:
- Special arrays are tagged with `__variable` containing Variable metadata
- All existing tests pass (no behavior changes)
- Foundation laid for Step 3 (fixing type guards)

## The Ultimate Goal

Transform mlld from a system that guesses types to one that knows types, while preserving every behavior that users depend on. This is about making the existing design work as intended, not replacing it with something new.