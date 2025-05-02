# AST Values Object Refactoring Implementation Roadmap

This document tracks progress on the refactoring of `DirectiveNode.values` from a flat array to a structured object.

## Approach Summary

1. Create test fixtures for each directive with the new structure
2. Write tests that will initially fail until grammar is updated
3. Update grammar files one by one, verifying after each change 
4. Update directive handlers to use the new structure
5. Run integration tests to ensure end-to-end functionality

## Directory Structure

```
/grammar
  /tests
    /fixtures           # AST fixture definitions 
    /snapshots          # For before/after AST comparison
    /utils              # Testing utilities
    directive-base.test.ts  # Base test framework
    [directive].test.ts     # Tests for specific directives
```

## Implementation Status

| Directive | Fixtures Created | Tests Written | Grammar Updated | Handler Updated | Tests Passing |
|-----------|------------------|---------------|----------------|----------------|--------------|
| Import    | ✅               | ✅            | ❌             | ❌             | ❌           |
| Embed     | ❌               | ❌            | ❌             | ❌             | ❌           |
| Text      | ❌               | ❌            | ❌             | ❌             | ❌           |
| Data      | ❌               | ❌            | ❌             | ❌             | ❌           |
| Path      | ❌               | ❌            | ❌             | ❌             | ❌           |
| Run       | ❌               | ❌            | ❌             | ❌             | ❌           |
| Define    | ❌               | ❌            | ❌             | ❌             | ❌           |

## Implementation Notes

### 1. Types & Interfaces

- Updated the `DirectiveNode` interface in core/syntax/types/nodes.ts
- Changed `values` type from `Node[]` to `Record<string, Node[]>`
- Added `raw` and `meta` properties to store:
  - Raw text segments (`raw`)
  - Metadata and derived information (`meta`)

### 2. Test Methodology

- Each directive's test file follows the same structure to ensure consistency
- Tests specifically verify the new structure: values object, raw properties, and metadata
- Snapshot comparisons help ensure backward compatibility during refactoring

### 3. Grammar Changes

The grammar files need to be updated one by one. For each directive:

1. Modify the grammar rule to capture groups of nodes separately
2. Capture raw text segments for each corresponding group
3. Construct the `values` object using captured node arrays
4. Construct the `raw` object using raw text segments
5. Add metadata derived from the input (isAbsolute, hasVariables, etc.)

### 4. Handler Updates

After grammar changes, handlers need to be updated to:

1. Access input nodes via the new structure (e.g., `directiveNode.values.path`)
2. Utilize the `raw` property when needed
3. Use metadata flags for conditional logic

## Priority Order

Implement directives in this order:

1. Import (simplest structure, already started)
2. Text (common, relatively simple)
3. Path (similar to text but with path validation)
4. Embed (more complex but frequently used)
5. Data (more complex data structure)
6. Run (complex with multiple syntax variants)
7. Define (most complex structure)

## Next Steps

- Complete Import directive implementation
- Start Text directive
- Regularly run tests and fix any issues before proceeding