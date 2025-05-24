# Test Factory and Service Test Update Plan

**Created:** 2025-01-19  
**Context:** During type restructure phase 5c, discovered test factories are creating nodes with incorrect structure, leading to handler modifications to accommodate tests (backwards approach).

## Current Problem

1. **Test factories create nodes with incorrect structure**
   - Path values are simplified objects instead of proper TextNode arrays
   - Missing proper node types (Text, VariableReference, etc.)
   - Not matching the actual AST structure from `core/ast/snapshots`

2. **Handler code being modified to accommodate test structure**
   - This is backwards - handlers should work with real AST structure
   - Tests should provide proper node structures that match real usage

3. **Test failures misleading development**
   - Tests fail not because handlers are wrong, but because test data is wrong
   - Leading to incorrect "fixes" in production code

## Correct AST Structure (from snapshots)

### Example: Add Directive with Path
```json
{
  "type": "Directive",
  "nodeId": "placeholder-id",
  "location": {...},
  "kind": "add",
  "subtype": "addPath",
  "source": "path",
  "values": {
    "path": [
      {
        "type": "Text",
        "nodeId": "placeholder-id",
        "content": "file.md",
        "location": {...}
      }
    ]
  },
  "raw": {
    "path": "file.md"
  },
  "meta": {
    "path": {
      "hasVariables": false,
      "isAbsolute": false,
      "hasExtension": true,
      "extension": "md"
    }
  }
}
```

### Example: Add Directive with Variable
```json
{
  "type": "Directive",
  "kind": "add",
  "subtype": "addVariable",
  "source": "variable",
  "values": {
    "variable": [
      {
        "type": "VariableReference",
        "nodeId": "placeholder-id",
        "valueType": "varIdentifier",
        "isVariableReference": true,
        "identifier": "variableName",
        "location": {...}
      }
    ]
  },
  "raw": {
    "variable": "@variableName"
  },
  "meta": {}
}
```

## Key Differences to Fix

1. **Path values should be TextNode arrays, not objects**
   ```typescript
   // WRONG (current test factory):
   path: [{
     raw: pathOrContent,
     structured: { segments: [...], base: '.' }
   }]
   
   // RIGHT (from AST snapshot):
   path: [{
     type: 'Text',
     nodeId: 'test-text-123',
     content: pathOrContent,
     location: {...}
   }]
   ```

2. **Variable references need proper structure**
   ```typescript
   // RIGHT:
   variable: [{
     type: 'VariableReference',
     nodeId: 'test-vref-123',
     valueType: 'varIdentifier',
     isVariableReference: true,
     identifier: 'variableName',
     location: {...}
   }]
   ```

3. **Source and meta fields must match snapshot structure**

## Action Plan

### Phase 1: Update Test Factories (Priority: HIGH)

1. **Update `createAddDirective` in `testFactories.ts`**
   - Fix path value creation to use TextNode arrays
   - Fix variable value creation to use VariableReference nodes
   - Add proper source field based on subtype
   - Add proper meta fields as shown in snapshots

2. **Update other directive factories**
   - `createTextDirective` - ensure identifier is VariableReference array
   - `createDataDirective` - ensure value matches expected structure
   - `createPathDirective` - ensure path values are correct
   - `createRunDirective` - ensure command values are correct
   - `createImportDirective` - ensure path and imports are correct
   - `createExecDirective` - ensure command structure is correct

3. **Create helper functions**
   ```typescript
   function createTextNodeArray(content: string): TextNode[]
   function createVariableReferenceArray(identifier: string): VariableReferenceNode[]
   function createPathNodeArray(path: string): PathNode[]
   ```

### Phase 2: Fix Handler Code (Priority: HIGH)

1. **Revert handler modifications**
   - Remove any code that tries to handle both old and new structures
   - Ensure handlers only expect the correct AST structure

2. **Simplify handler logic**
   ```typescript
   // Example for AddDirectiveHandler:
   case 'addPath':
     const pathNodes = node.values.path; // Should be TextNode[]
     const pathContent = pathNodes[0].content;
     // ... rest of logic
   ```

### Phase 3: Update Service Tests (Priority: MEDIUM)

1. **Find all tests creating directive nodes**
   ```bash
   grep -r "createAddDirective\|createTextDirective\|createDataDirective" services/
   ```

2. **Update test expectations**
   - Ensure tests expect the correct node structure
   - Update any custom node creation to match snapshots

3. **Fix mock services**
   - Update any mocks that create or return directive nodes
   - Ensure ResolutionService mocks return proper values

### Phase 4: Create Test Utilities (Priority: MEDIUM)

1. **AST snapshot loader**
   ```typescript
   function loadAstSnapshot(directiveName: string): DirectiveNode
   function loadAstFixture(fixtureName: string): any
   ```

2. **Node comparison utilities**
   ```typescript
   function compareNodeStructure(actual: Node, expected: Node): boolean
   function assertNodeMatchesSnapshot(node: Node, snapshotName: string): void
   ```

### Phase 5: Documentation (Priority: LOW)

1. **Update test documentation**
   - Document the correct node structure for tests
   - Provide examples of proper test node creation

2. **Create migration guide**
   - List common patterns that need updating
   - Provide before/after examples

## Files to Update

### Test Factories
- `/tests/utils/testFactories.ts` - Main factory file
- `/tests/utils/nodeFactories.ts` - Helper functions

### Handler Files (to revert/fix)
- `/services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/definition/ExecDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/resolution/ImportDirectiveHandler.ts`
- `/services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`

### Test Files
- All `*.test.ts` files in `/services/` that use directive factories
- Mock files in `/tests/mocks/`

## Success Criteria

1. **All test factories create nodes matching AST snapshots**
2. **Handlers work with real AST structure only**
3. **No handler code accommodating test-specific structures**
4. **All tests pass with correct node structures**
5. **Test nodes can be validated against AST fixtures**

## Implementation Order

1. Create helper functions for node creation
2. Update `createAddDirective` as pilot
3. Run AddDirectiveHandler tests to verify
4. Update remaining factories
5. Fix all handler code
6. Update all tests
7. Run full test suite
8. Document changes

## Notes

- This is a critical fix to ensure tests reflect real usage
- Will prevent future confusion about node structure
- Sets up tests to catch real issues, not structure mismatches
- Should be done before continuing with phase 5c handler updates