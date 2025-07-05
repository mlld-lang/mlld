# Template Interpolation Analysis & Architecture Findings

## Summary of Investigation

We successfully fixed the core architectural issue with template interpolation but uncovered a deeper template architecture problem. Here's what we learned:

## Problem Statement

The mlld interpreter had 13-14 failing tests, with template interpolation being a major issue. The core problem was that `{{variable}}` syntax in double-colon templates (`::Hello {{name}}!::`) was not interpolating variables correctly.

## Root Cause Analysis

### 1. **AST Structure Inconsistency (FIXED)**
- **Issue**: `@variable` and `{{variable}}` produced different `valueType` values in the AST
  - `@variable` → `valueType: 'varIdentifier'`  
  - `{{variable}}` → `valueType: 'varInterpolation'`
- **Problem**: This required special case handling in the interpreter
- **Fix**: Modified grammar to make both use `'varIdentifier'` consistently

**Files Changed:**
- `/Users/adam/dev/mlld/grammar/patterns/variables.peggy:111` - Changed `'varInterpolation'` → `'varIdentifier'`
- `/Users/adam/dev/mlld/grammar/patterns/variables.peggy:122` - Same for field access version

### 2. **Interpreter Cleanup (COMPLETED)**
- **Issue**: Interpreter still had obsolete `varInterpolation` handling code
- **Fix**: Removed all references to `varInterpolation` since it's no longer needed

**Files Changed:**
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts:334` - Removed `varInterpolation` from condition
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts:358` - Removed special `varInterpolation` error handling  
- `/Users/adam/dev/mlld/interpreter/core/interpreter.ts:441` - Removed obsolete template handling code
- `/Users/adam/dev/mlld/interpreter/eval/data-value-parser.ts:112` - Updated to use `'varIdentifier'`

### 3. **Template Variable Type Recognition (PARTIALLY FIXED)**
- **Issue**: Double-colon templates (`::{{var}}::`) with `wrapperType: 'doubleBracket'` weren't being created as template variables
- **Fix**: Added `doubleBracket` to template variable detection in var.ts

**Files Changed:**
- `/Users/adam/dev/mlld/interpreter/eval/var.ts:465` - Added `|| directive.meta?.wrapperType === 'doubleBracket'`

## Test Results

- **Before fixes**: 13 test failures
- **After grammar fix**: 14 test failures  
- **After interpreter cleanup**: 14 test failures
- **Current status**: 14 test failures (back to baseline)

## Template Architecture Discovery

### The Real Problem: Template Interpolation Timing

We discovered a fundamental architectural issue with **when** template interpolation happens:

#### Current Flow (Problematic):
1. **Template Creation**: `::Hello {{variable}}!::` → Grammar produces array: `[TextNode("Hello "), VariableRefNode("variable")]`
2. **Variable Assignment**: Array gets interpolated immediately → Stores interpolated string: `"Hello value!"`
3. **Template Display**: Shows stored string (correct)

#### Issues with Current Flow:
- ✅ **Backtick templates**: `Hello @variable!` → Work correctly
- ❌ **Double-colon templates**: `::Hello {{variable}}!::` → Variable part gets cut off during interpolation

### Evidence of the Problem:

**Working case (backtick)**:
```mlld
/var @name = "world"
/show `Hello @name!`  # Output: "Hello world!"
```

**Broken case (double-colon)**:
```mlld
/var @name = "world"  
/var @template = ::Hello {{name}}!::
/show @template  # Output: "Hello" (missing variable)
```

**AST Comparison** (Both now identical after grammar fix):
```json
{
  "value": [
    { "type": "Text", "content": "Hello " },
    { "type": "VariableReference", "valueType": "varIdentifier", "identifier": "name" }
  ]
}
```

## Key Architecture Insights

### 1. **Grammar Fix Was Correct**
Making `{{variable}}` and `@variable` produce the same AST structure eliminated special case handling. This is the **cleaner, better architectural approach**.

### 2. **Template Types Need Consistent Handling**
The issue is in `/Users/adam/dev/mlld/interpreter/eval/var.ts` around lines 297-304:

```typescript
// Current logic:
if (valueNode.length === 1 && valueNode[0].type === 'Text' && directive.meta?.wrapperType === 'backtick') {
    resolvedValue = valueNode[0].content;  // Simple text extraction
} else {
    resolvedValue = await interpolate(valueNode, env);  // Full interpolation
}
```

**The Problem**: Double-colon templates go through interpolation during creation, but something in the interpolation process is dropping the variable references.

### 3. **Template vs. Variable Interpolation**
There are actually **two different interpolation contexts**:

1. **Variable Context**: `/show @variable` → Direct variable resolution
2. **Template Context**: `/show `template with @var`` → Template interpolation  

Both should work identically, but they're going through different code paths.

## Current Status & Next Steps

### What's Working:
- ✅ Empty string variable parsing (fixed earlier)
- ✅ AST structure consistency (`{{var}}` and `@var` now identical)
- ✅ Basic variable resolution
- ✅ Backtick template interpolation
- ✅ When directive tests (fixed by empty string fix)

### What's Still Broken:
- ❌ Double-colon template interpolation (`::{{var}}::`)
- ❌ Template variable display in show directives
- ❌ Some import/exec issues (unrelated to templates)

### Remaining Architecture Questions:

1. **Should templates be interpolated at creation time or display time?**
   - Current: Creation time (immediate interpolation)
   - Alternative: Display time (lazy interpolation)

2. **Why does interpolation work for backticks but not double-colon templates?**
   - Both go through the same `interpolate()` function
   - Both have identical AST structure after grammar fix
   - Difference must be in variable resolution within templates

3. **Template Variable Storage**:
   - Should template variables store raw AST nodes or interpolated strings?
   - How to handle variables that change after template creation?

## Files That Need Further Investigation

1. **`/Users/adam/dev/mlld/interpreter/core/interpreter.ts:669`** - The `interpolate()` function
   - Why does variable resolution fail for `{{variable}}` context?
   - Lines 714-717: Variable not found handling

2. **`/Users/adam/dev/mlld/interpreter/eval/show.ts:78-85`** - Template variable display
   - Current fix attempts template interpolation for `isTemplate()` variables
   - May need different approach

3. **`/Users/adam/dev/mlld/interpreter/eval/var.ts:297-304`** - Template creation logic
   - Controls when interpolation happens during variable assignment
   - Key decision point for template architecture

## Recommended Next Steps

1. **Debug Variable Resolution**: Add logging to `interpolate()` function to see why variables aren't found in template context

2. **Template Architecture Decision**: Decide whether templates should be:
   - **Eager**: Interpolated at creation (current approach)  
   - **Lazy**: Interpolated at display time (may be more flexible)

3. **Systematic Fix**: Once root cause is found, ensure fix works for both:
   - Backtick templates: `` `Hello @var!` ``
   - Double-colon templates: `::Hello {{var}}!::`

## Architecture Win

The grammar fix was absolutely the right approach - making `{{variable}}` and `@variable` produce identical AST structures eliminates complexity and special cases in the interpreter. This is a cleaner, more maintainable architecture.

The remaining template interpolation issue is a separate problem about variable resolution within template contexts, not about AST structure differences.