# AST Type Preservation Fix Plan

## Issue Analysis Summary

1. **Object literal parsing**: Objects in function arguments become empty strings (`""`)
2. **Template evaluation errors**: "Unexpected template value in lazy evaluation" 
3. **Parameter type preservation**: AST data types lost during exec invocation processing

All three issues stem from **rigid type assumptions** that don't align with mlld's **AST-first, deferred evaluation** architecture.

## Root Cause: Parameter Processing Pipeline

The core problem is in **exec-invocation.ts:186-214** where we force everything through string conversion:

```typescript
// CURRENT PROBLEMATIC CODE
for (const arg of args) {
  let argValue: string;  // ← FORCES STRING CONVERSION
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
    argValue = String(arg);
  } else if (arg && typeof arg === 'object' && 'type' in arg) {
    argValue = await interpolate([arg], env, InterpolationContext.Default);
    // ↑ Object literals get stringified and lost here
  }
}
```

## Grammar Investigation Results

### Discovered: Sophisticated AST Structure

**Key Finding**: The grammar produces **hierarchical, semantically-rich AST structures** that preserve full complexity:

**Simple literals** (previous understanding):
```javascript
// Object: { type: 'object', properties: { key: 'value' } }
// Array:  { type: 'array', items: [ 1, 2, 3 ] }
```

**Complex structures** (actual capability):
```javascript
// Object with exec invocations, paths, templates:
{
  type: 'object',
  properties: {
    command: { type: 'ExecInvocation', commandRef: {...} },    // ← Full exec AST
    path: { type: 'path', segments: [...] },                   // ← Full path AST
    template: { content: [...], wrapperType: 'backtick' }      // ← Full template AST
  }
}

// Array with variables, exec invocations, paths:
{
  type: 'array',
  items: [
    { type: 'VariableReference', identifier: 'var1' },        // ← Variable reference  
    { type: 'ExecInvocation', commandRef: {...} },            // ← Exec invocation
    { type: 'path', segments: [...] }                         // ← Path reference
  ]
}
```

### AST Design Assessment: EXCELLENT

**Why this design is brilliant**:
1. **Composability**: Any mlld construct can be nested anywhere
2. **Lazy evaluation**: Complex elements aren't evaluated until needed  
3. **Type preservation**: Each element maintains its semantic identity
4. **Consistency**: Same evaluation logic works at any nesting level

This AST design treats **data structures as first-class execution contexts**, which perfectly aligns with mlld's deferred evaluation model.

## Solution Architecture: AST-Aware Parameter Processing

### Core Principle
**Preserve AST data types throughout the pipeline** - convert to target types only at final consumption points (JS execution, shell commands, display).

### Implementation Strategy

**Recursive AST evaluation** that preserves hierarchical structure:
1. **String track**: For shell commands and display (`evaluatedArgStrings`)
2. **AST track**: For code execution and object handling (`evaluatedArgs`)
3. **Recursive evaluation**: Handle nested structures via `evaluateDataValue()`

## Change Set

### 1. Fix Parameter Type Preservation (exec-invocation.ts)

**File**: `/Users/adam/dev/mlld/interpreter/eval/exec-invocation.ts`
**Lines**: 186-214

```typescript
// CURRENT CODE (broken)
const evaluatedArgStrings: string[] = [];
const evaluatedArgs: any[] = []; // Preserve original data types

for (const arg of args) {
  let argValue: string;
  let argValueAny: any;
  
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
    argValue = String(arg);
    argValueAny = arg; // Preserve original type
  } else if (arg && typeof arg === 'object' && 'type' in arg) {
    argValue = await interpolate([arg], env, InterpolationContext.Default);
    // PROBLEM: Try to parse back, but this loses object structure
    try {
      argValueAny = JSON.parse(argValue);
    } catch {
      argValueAny = argValue;
    }
  }
}
```

**REPLACEMENT CODE**:

```typescript
const evaluatedArgStrings: string[] = [];
const evaluatedArgs: any[] = [];

for (const arg of args) {
  let argValue: string;
  let argValueAny: any;
  
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
    // Primitives: pass through directly
    argValue = String(arg);
    argValueAny = arg;
    
  } else if (arg && typeof arg === 'object' && 'type' in arg) {
    // AST nodes: evaluate based on type
    switch (arg.type) {
      case 'object':
        // Object literals: recursively evaluate properties (may contain exec invocations, etc.)
        const { evaluateDataValue } = await import('./value-evaluator');
        argValueAny = await evaluateDataValue(arg, env);
        argValue = JSON.stringify(argValueAny);
        break;
        
      case 'array':
        // Array literals: recursively evaluate items (may contain variables, exec calls, etc.)
        const { evaluateDataValue: evalArray } = await import('./value-evaluator');
        argValueAny = await evalArray(arg, env);
        argValue = JSON.stringify(argValueAny);
        break;
        
      case 'VariableReference':
      case 'ExecInvocation':
      case 'Text':
      default:
        // Other nodes: interpolate normally
        argValue = await interpolate([arg], env, InterpolationContext.Default);
        // Try to preserve structured data if it's JSON
        try {
          argValueAny = JSON.parse(argValue);
        } catch {
          argValueAny = argValue;
        }
        break;
    }
  } else {
    // Fallback for unexpected types
    argValue = String(arg);
    argValueAny = arg;
  }
  
  evaluatedArgStrings.push(argValue);
  evaluatedArgs.push(argValueAny);
}
```

### 2. Fix Template Evaluation (value-evaluator.ts)

**File**: `/Users/adam/dev/mlld/interpreter/eval/value-evaluator.ts`
**Lines**: 273-277

```typescript
// CURRENT CODE (broken)
if (isTemplateValue(value)) {
  // Templates should be interpolated before storage
  throw new Error('Unexpected template value in lazy evaluation');
}
```

**REPLACEMENT CODE**:

```typescript
// Handle template values - they're valid in lazy evaluation context
if (isTemplateValue(value)) {
  // Templates in lazy evaluation are deferred execution contexts
  // Interpolate them now with full environment context
  const { interpolate } = await import('../core/interpreter');
  return await interpolate(value, env);
}
```

### 3. Add Object/Array Literal Support (value-evaluator.ts)

**File**: `/Users/adam/dev/mlld/interpreter/eval/value-evaluator.ts`
**Location**: Add after line 314 (after DataObject handling)

**Note**: Based on grammar investigation, we now know objects/arrays can contain **any mlld construct** (exec invocations, variable references, paths, templates, etc.), so we need **full recursive evaluation**.

```typescript
// Handle object literals from grammar (with full AST support)
if (value && typeof value === 'object' && value.type === 'object' && 'properties' in value) {
  // Object literals can contain any mlld construct - recursively evaluate all properties
  const evaluatedObject: Record<string, any> = {};
  for (const [key, propValue] of Object.entries(value.properties)) {
    // Recursively evaluate each property (could be exec invocations, variables, etc.)
    evaluatedObject[key] = await evaluateDataValue(propValue, env);
  }
  return evaluatedObject;
}

// Handle array literals from grammar (with full AST support)
if (value && typeof value === 'object' && value.type === 'array' && 'items' in value) {
  // Array literals can contain any mlld construct - recursively evaluate all items
  const evaluatedArray = [];
  for (const item of value.items) {
    // Recursively evaluate each item (could be variables, exec calls, paths, etc.)
    evaluatedArray.push(await evaluateDataValue(item, env));
  }
  return evaluatedArray;
}
```

### 4. Grammar Investigation Completed ✅

**Investigation Results**: The grammar produces sophisticated, hierarchical AST structures:

**Simple cases**:
```bash
# /run @test({"key": "value"}) produces:
{ type: 'object', properties: { key: 'value' } }

# /run @test([1, 2, 3]) produces:  
{ type: 'array', items: [ 1, 2, 3 ] }
```

**Complex cases** (exec invocations, variables, paths, templates):
```bash
# /run @test({"command": @getConfig(), "template": `Hello @name`}) produces:
{
  type: 'object',
  properties: {
    command: { type: 'ExecInvocation', commandRef: {...} },
    template: { content: [...], wrapperType: 'backtick' }
  }
}
```

**Conclusion**: Grammar fully supports nested mlld constructs - no limitations found.

## Expected Outcomes

### Immediate Fixes
- **Object literals**: `{"includeContent": true}` preserves as object, not empty string
- **Array literals**: `[1, 2, 3]` preserves as array, not string
- **Template evaluation**: Backtick templates with variables work in lazy evaluation contexts

### Test Results Expected
- `literals-in-function-args` test passes with proper object/array handling
- `when-optional-slash-combined` test passes without template evaluation errors
- All exec invocation tests maintain consistent parameter handling

### Architectural Benefits
- **AST-first**: Data types preserved throughout the pipeline
- **Consistent**: Same logic for direct calls and foreach operations (aligns with EXEC_CONSOLIDATION_PLAN.md)
- **Flexible**: Templates become first-class deferred execution contexts

## Risk Assessment

**Low Risk Changes**:
- Template evaluation fix is additive (removes error, adds functionality)
- Parameter processing maintains backward compatibility via dual-track approach

**Medium Risk Changes**:
- Object/array literal handling depends on exact grammar output structure
- Need to verify grammar produces expected AST structure

## Implementation Order

1. **Investigate grammar output** for object/array literals (5 minutes)
2. **Fix template evaluation** (immediate, low risk)
3. **Fix parameter processing** (core fix, test thoroughly)
4. **Add literal handling** (based on grammar investigation results)
5. **Run full test suite** to verify no regressions

This approach preserves mlld's AST-centric architecture while fixing the immediate type preservation issues.

## Why This Fixes All Three Core Issues

### 1. Object Literal Parsing
**Root cause**: `interpolate()` stringifies objects, losing structure
**Fix**: AST-aware parameter processing evaluates objects directly via `evaluateDataValue()`
**Result**: `{"includeContent": true}` becomes a real object, not `""`

### 2. Template Evaluation Errors  
**Root cause**: Rigid assumption that templates shouldn't exist in lazy evaluation
**Fix**: Accept templates as deferred execution contexts, interpolate them
**Result**: `` `Deploying @appName to production...` `` works in when blocks

### 3. Parameter Type Preservation
**Root cause**: Single string track loses data type information
**Fix**: Dual-track processing preserves both string and AST representations
**Result**: Code execution gets proper objects/arrays, shell commands get strings

## Alignment with mlld Architecture

This fix plan aligns with mlld's core principles:

- **AST-first**: Work with the AST structure, don't fight it
- **Deferred evaluation**: Templates and objects can contain complex logic
- **Type preservation**: Maintain data integrity throughout the pipeline
- **Unified execution**: Consistent handling across all exec invocation paths

The changes make the interpreter **more consistent with its own design**, rather than working around architectural assumptions.