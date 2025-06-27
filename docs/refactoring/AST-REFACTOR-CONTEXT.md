# AST Type Normalization Refactor - Context & Overview

## The Problem

mlld's AST has an inconsistent representation of data values:
- **Most AST nodes**: Have a `type` property (`type: 'array'`, `type: 'object'`, etc.)
- **Plain JS objects in data**: No type property, just raw JavaScript objects

This causes:
- Defensive programming everywhere (`if (node.type) ...`)
- Bugs when code forgets to handle untyped nodes
- Difficult maintenance and onboarding

## Why This Matters Now

Recent bug discoveries show this inconsistency causes real issues:
- Objects in arrays becoming empty strings
- Array functions (filter, groupBy, find) failing on string comparisons
- JSON serialization producing AST nodes instead of values

## Our Approach: Incremental Normalization

Instead of a big-bang refactor, we're using a shim pattern:
1. Create `ASTEvaluator` that normalizes values to what the grammar WILL produce
2. Incrementally adopt it where needed
3. Update grammar to produce normalized AST
4. ASTEvaluator becomes passthrough
5. Remove ASTEvaluator entirely

This approach lets us:
- Fix bugs immediately
- Write future-compatible code now
- Migrate incrementally with safety
- Measure progress clearly

## The 6-Phase Plan

### Phase 1: ASTEvaluator for Arrays
Fix array-related issues with minimal changes

### Phase 2: ASTEvaluator for Objects  
Extend to handle object normalization

### Phase 3: Grammar Output Tests
Define exactly what the grammar should produce

### Phase 4: Update Grammar
Implement consistent typing in the parser

### Phase 5: ASTEvaluator Passthrough
Grammar now provides types; shim becomes no-op

### Phase 6: Remove ASTEvaluator
Clean up the shim layer entirely

## Implementation Status

### Phase 1: ASTEvaluator for Arrays ✅ COMPLETE
- [x] Create ASTEvaluator class with array normalization
- [x] Update array module functions (via exec-invocation.ts)
- [x] Fix filter, groupBy, find issues
- [x] Add tests for normalized arrays

### Phase 2: ASTEvaluator for Objects ✅ COMPLETE
- [x] Extend ASTEvaluator for object normalization
- [x] Update object evaluation paths (var.ts)
- [x] Handle namespace objects (import.ts)
- [x] Update field access (field-access.ts)

### Phase 3: Grammar Output Tests ✅ COMPLETE
- [x] Create test suite for expected AST structure
- [x] Document all data type representations
- [x] Identify specific grammar issues to fix

### Phase 4: Update Grammar
- [ ] Implement data type grammar rules
- [ ] Add semantic fork for data context

### Phase 5: ASTEvaluator Passthrough
- [ ] Add feature flag for new grammar
- [ ] Make ASTEvaluator conditional

### Phase 6: Remove ASTEvaluator
- [ ] Delete ASTEvaluator class
- [ ] Remove all shim references

## Key Design Decisions

1. **Future-Compatible Structure**: ASTEvaluator outputs what the grammar will produce
2. **Incremental Adoption**: Use ASTEvaluator only where needed, not everywhere
3. **Clear Boundaries**: Each phase has clear scope and deliverables
4. **Measurable Progress**: Telemetry to track shim usage

## Related Documents

### Planning Documents
- `ast-data-types-current-workarounds.md` - Current inconsistencies explained
- `ast-data-types-ideal-implementation.md` - Long-term vision
- `AST-REFACTOR-1.md` - Phase 1 detailed plan
- `AST-REFACTOR-2.md` - Phase 2 detailed plan
- `AST-REFACTOR-3.md` - Phase 3 detailed plan
- `AST-REFACTOR-4.md` - Phase 4 detailed plan

### Implementation Guides
- **`AST-REFACTOR-STATUS.md`** - Current implementation status (READ THIS FIRST)
- **`AST-REFACTOR-PHASE3-GUIDE.md`** - How to implement Phase 3
- **`AST-REFACTOR-PHASE4-GUIDE.md`** - How to implement Phase 4

## Quick Links for Next Implementer

1. **Current Status**: See `AST-REFACTOR-STATUS.md` for what's done
2. **Next Step**: Implement Phase 3 using `AST-REFACTOR-PHASE3-GUIDE.md`
3. **Grammar Work**: Then Phase 4 using `AST-REFACTOR-PHASE4-GUIDE.md`
4. **Key Issue**: GitHub #283 - Object literals in arrays need grammar fix