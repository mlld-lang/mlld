# Type Refactor Phase 3 Brief

## Current Status
✅ Phase 1 & 2 Complete - Special arrays now use Variable metadata for type preservation

## Phase 3 Mission: Make Variables Flow

### The Problem
Currently, we extract raw values from Variables too early:
```typescript
// Current: Variable → raw value → lose type info
const value = resolveVariableValue(variable);  // Returns any

// Goal: Variable → Variable → preserve type info
const variable = resolveVariable(variable);  // Returns Variable
```

### Key Files to Examine
1. **interpreter/core/interpreter.ts**
   - `interpolate()` - Main string building function
   - `resolveVariableValue()` - Currently extracts values

2. **interpreter/eval/var.ts**
   - `evaluateArrayItem()` - Evaluates array elements
   - Already handles Variables well in most cases

3. **interpreter/eval/lazy-eval.ts**
   - Handles lazy evaluation for templates
   - May need Variable preservation

### Strategy
1. **Map extraction points** - Find all places doing `variable.value`
2. **Classify by necessity** - Which truly need raw values?
3. **Update incrementally** - One function at a time
4. **Test thoroughly** - Complex interactions possible

### First Steps
1. Search for `resolveVariableValue` usage
2. Search for `.value` access on Variables
3. Create RESOLUTION-POINTS.md with findings
4. Start with lowest-risk changes

### Success Criteria
- Variables flow deeper before extraction
- Type information preserved longer
- All 821 tests still pass
- No performance regression

### Watch Out For
- Command execution needs actual strings
- File I/O needs actual content
- External APIs need serializable data
- Circular references with nested Variables