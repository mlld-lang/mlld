# AST Values Object Refactoring Implementation Plan

This document outlines the process for refactoring the `DirectiveNode` structure to use a structured object approach instead of a flat array, along with comprehensive type definitions.

## Goal

Create a robust, strongly-typed AST structure for Meld directives that:

1. Provides clear semantic grouping of related nodes
2. Preserves raw text for each semantic group
3. Captures relevant metadata
4. Enforces type safety through comprehensive type definitions
5. Is well-documented for future maintenance

## Implementation Structure

We're implementing this refactoring using a structured approach:

```
/grammar
  /docs                   # Documentation by directive/subtype
  /directives             # Peggy grammar files
  /types                  # TypeScript type definitions
  /fixtures               # Test fixtures and examples
  /tests                  # Test implementation
```

All components are organized by directive kind, then by subtype for clarity and separation of concerns.

## Implementation Process

### Phase 1: Planning and Conversation

For each directive, we'll have a structured conversation to define:

1. All possible syntax variations
2. The exact structure of the values object
3. The specific node types that appear in each value array
4. The raw text segments that need to be captured
5. The metadata that should be derived and stored

### Phase 2: Documentation

Based on the conversation, we'll create:

1. A directive overview document (`kind.md`)
2. Subtype-specific documents (`kind.subtype.md`) for each variant
3. Example AST outputs for typical use cases

### Phase 3: Type Definition

Implement strong typing with:

1. Base node interfaces that all nodes extend
2. Directive-specific type definitions
3. Subtype-specific interfaces with exact property requirements
4. Type guards for runtime type checking
5. Type exports for reuse in tests and elsewhere

### Phase 4: Test Fixtures

Create comprehensive test fixtures:

1. Input examples for all syntax variations
2. Expected AST output with exact type structure
3. Edge cases and special handling scenarios

### Phase 5: Grammar Implementation

Update the grammar files to:

1. Capture raw text segments alongside parsed nodes
2. Construct the values object with the right node arrays
3. Build the raw object with captured text segments
4. Add metadata based on the input
5. Return a properly structured directive node

### Phase 6: Testing and Verification

Run comprehensive tests to:

1. Verify the grammar produces the expected AST structure
2. Confirm type compatibility with the defined interfaces
3. Check edge cases and error handling
4. Ensure backward compatibility where needed

### Phase 7: Handler Updates

Finally, update directive handlers to:

1. Use the new structure and type definitions
2. Access specific node groups via the values object
3. Utilize raw text and metadata where appropriate
4. Add type assertions for safety

## Directive Implementation Order

We'll implement the directives in this order, from simplest to most complex:

1. Import (in progress)
2. Text
3. Path
4. Data
5. Embed
6. Run
7. Define

## Conversation Schedule

For each directive, we'll have a structured conversation covering:

1. **Directive Overview**
   - Purpose and general usage
   - Current implementation assessment
   - Key challenges and considerations

2. **Syntax Analysis**
   - All valid syntax forms
   - Detailed breakdown of components
   - Identification of semantic groups

3. **AST Structure Definition**
   - Required keys in values object
   - Node types for each key
   - Raw text capture requirements
   - Metadata derivation

4. **Edge Cases & Special Handling**
   - Unusual syntax variations
   - Error handling considerations
   - Backward compatibility needs

## Current Status

- Import directive: Grammar implementation complete, tests in progress
- Additional directives: Planning phase

## Implementation Checklist

For each directive:

- [ ] Have structured conversation about AST structure
- [ ] Create overview documentation (kind.md)
- [ ] Create subtype documentation (kind.subtype.md)
- [ ] Define type interfaces (kind.types.ts, kind.subtype.types.ts)
- [ ] Create test fixtures (kind.fixtures.ts, kind.subtype.fixtures.ts)
- [ ] Update grammar implementation (kind.peggy, kind.subtype.peggy)
- [ ] Run and verify tests (kind.test.ts, kind.subtype.test.ts)
- [ ] Update handlers to use new structure

## Next Actions

1. Complete Import directive implementation with tests
2. Proceed with Text directive structured conversation
3. Continue through remaining directives in specified order

## Benefits of This Approach

This structured approach ensures:

1. **Precision**: Clearly defined types reduce ambiguity
2. **Maintainability**: Documentation stays tied to implementation
3. **Testability**: Comprehensive fixtures verify correctness
4. **Extensibility**: New subtypes can follow the established pattern
5. **Clarity**: Separation by directive and subtype improves organization