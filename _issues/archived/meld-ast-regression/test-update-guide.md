# Test Update Guide for meld-ast 3.3.0

This guide identifies specific locations in test files that likely need to be updated due to changes in array notation handling between meld-ast 3.0.1 and 3.3.0.

## Key AST Changes

When updating tests, keep these changes in mind:

- **Old:** Expected to throw error on bracket notation
- **New:** Now supports bracket notation with field type "index"

- **Old:** fields: [{ type: "identifier", value: "0" }]
- **New:** fields: [{ type: "index", value: 0 }]

## Files Needing Updates

### /Users/adam/dev/meld/tests/utils/tests/TestContext.test.ts

Found 2 locations that likely need updates:

#### Location 1 (Line 63)

```javascript

      expect(ast).toHaveLength(1);
      expect(ast[0].type).toBe('Directive');
      expect(ast[0].directive).toBeDefined();
      expect(ast[0].directive.kind).toBe('text');
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 2 (Line 75)

```javascript

      expect(ast).toHaveLength(1);
      expect(ast[0].type).toBe('Directive');
      expect(ast[0].directive).toBeDefined();
      expect(ast[0].directive.kind).toBe('text');
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

### /Users/adam/dev/meld/tests/meld-ast-nested-fences.test.ts

Found 4 locations that likely need updates:

#### Location 1 (Line 19)

```javascript
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('CodeFence');
    expect(result.ast[0].content).toBe('```\nouter\n```');
  });
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 2 (Line 37)

```javascript
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('CodeFence');
    expect(result.ast[0].content).toBe('````\nouter\n```\ninner\n```\n````');
  });
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 3 (Line 55)

```javascript
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('CodeFence');
    expect(result.ast[0].language).toBe('typescript');
    expect(result.ast[0].content).toBe('```typescript\nconst x = 1;\n```');
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 4 (Line 74)

```javascript
    expect(result.ast).toBeDefined();
    expect(result.ast).toHaveLength(1);
    expect(result.ast[0].type).toBe('CodeFence');
    expect(result.ast[0].language).toBe('typescript');
    expect(result.ast[0].content).toBe('````typescript\nouter\n```js\ninner\n```\n````');
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

### /Users/adam/dev/meld/tests/utils/debug/StateHistoryService/StateHistoryService.test.ts

Found 1 locations that likely need updates:

#### Location 1 (Line 121)

```javascript
      const history = historyService.queryHistory({ types: ['create'] });
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('create');
    });

```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

### /Users/adam/dev/meld/tests/utils/debug/StateDebuggerService/StateDebuggerService.test.ts

Found 3 locations that likely need updates:

#### Location 1 (Line 122)

```javascript

      expect(diagnostics).toHaveLength(2); // Two warnings
      expect(diagnostics[0].type).toBe('warning');
      expect(diagnostics[0].message).toContain('transformations');
      expect(diagnostics[1].type).toBe('warning');
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 2 (Line 124)

```javascript
      expect(diagnostics[0].type).toBe('warning');
      expect(diagnostics[0].message).toContain('transformations');
      expect(diagnostics[1].type).toBe('warning');
      expect(diagnostics[1].message).toContain('child states');
    });
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

#### Location 3 (Line 152)

```javascript

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].type).toBe('error');
      expect(diagnostics[0].message).toContain('Failed to retrieve state');
    });
```

**Suggestion:** This line may need to be updated to account for the new array notation handling in meld-ast 3.3.0.

## Summary

Total files to update: 4
Total locations to modify: 10

## General Update Strategy

1. Update tests that expect array notation to fail to instead validate the new AST structure
2. Change field type expectations from "identifier" to "index" for array indices
3. Update expected values: numeric indices are now numbers, not strings (e.g., `value: 0` instead of `value: "0"`)
