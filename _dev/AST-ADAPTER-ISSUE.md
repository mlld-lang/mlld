# AST Adapter Layer Issue

## Problem

Our fixture-based tests are using adapter layers to convert between the actual AST structure and what the handlers expect. This is masking a fundamental issue: the handlers are out of sync with the current AST structure.

## Current Situation

### Actual AST Structure (from fixtures)
```javascript
{
  type: "Directive",
  kind: "data",
  subtype: "dataAssignment",
  source: "object",
  values: {
    identifier: [{ identifier: "user" }],
    value: { type: "object", properties: {...} }
  },
  raw: { ... },
  meta: { ... }
}
```

### Handler Expectations (outdated)
```javascript
{
  directive: {
    kind: "data",
    identifier: "user",
    value: { ... },
    source: "object"
  }
}
```

### Test Adapter (workaround)
```javascript
const adaptedNode = {
  ...directiveNode,
  directive: {
    kind: directiveNode.kind,
    identifier: directiveNode.values?.identifier?.[0]?.identifier,
    value: directiveNode.values?.value,
    source: directiveNode.source
  }
};
```

## Impact

1. **Technical Debt**: Tests don't reflect reality
2. **Maintenance Burden**: Adapter layers need updating when AST changes
3. **Hidden Bugs**: Real AST incompatibilities are masked
4. **Confusion**: New developers won't understand why adapters exist

## Root Cause

The handlers were not updated when the AST structure changed. They still expect a `directive` property that no longer exists.

## Solution

### 1. Update Handlers (Correct Approach)
```javascript
// Instead of:
const identifier = node.directive.identifier;

// Use:
const identifier = node.values.identifier[0].identifier;
```

### 2. Remove Adapters from Tests
```javascript
// Remove adapter layer
const node = await getDirectiveFromFixture('data-object-1');
// Use directly without adaptation
```

### 3. Fix Type Definitions
Ensure DirectiveNode type matches actual structure

## Migration Plan

1. **Identify all handlers** using old AST structure
2. **Update each handler** to use correct property paths
3. **Remove adapter layers** from tests
4. **Verify tests pass** with real AST
5. **Update type definitions** if needed

## Affected Handlers

- [x] DataDirectiveHandler (uses node.directive)
- [x] PathDirectiveHandler (uses node.directive)
- [x] ImportDirectiveHandler (uses node.directive)
- [ ] AddDirectiveHandler (needs checking)
- [ ] RunDirectiveHandler (needs checking)
- [ ] ExecDirectiveHandler (needs checking)

## Benefits of Fixing

1. **Cleaner tests**: No adapter complexity
2. **Better alignment**: Code matches actual AST
3. **Easier debugging**: What you test is what you get
4. **Future-proof**: Changes to AST are immediately visible

## Conclusion

The adapter layer is a symptom of a deeper issue. We should fix the handlers to use the actual AST structure rather than working around it in tests.