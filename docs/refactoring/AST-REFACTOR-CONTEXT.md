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

### Phase 1: ASTEvaluator for Arrays
- [ ] Create ASTEvaluator class with array normalization
- [ ] Update array module functions
- [ ] Fix filter, groupBy, find issues
- [ ] Add tests for normalized arrays

### Phase 2: ASTEvaluator for Objects
- [ ] Extend ASTEvaluator for object normalization
- [ ] Update object evaluation paths
- [ ] Handle namespace objects
- [ ] Update field access

### Phase 3: Grammar Output Tests
- [ ] Create test suite for expected AST structure
- [ ] Document all data type representations

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

- `ast-data-types-current-workarounds.md` - Current inconsistencies explained
- `ast-data-types-ideal-implementation.md` - Long-term vision
- `AST-REFACTOR-1.md` - Phase 1 detailed plan
- `AST-REFACTOR-2.md` - Phase 2 detailed plan
- `AST-REFACTOR-3.md` - Phase 3 detailed plan
- `AST-REFACTOR-4.md` - Phase 4 detailed plan