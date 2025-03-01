# meld-ast Regression Analysis: 3.0.1 vs 3.3.0

## Summary of Findings

This report documents the regression analysis between meld-ast versions 3.0.1 and 3.3.0, focusing on array notation handling.

## Key Differences

### Array Notation Support

1. **Version 3.0.1**:
   - Does not support bracket notation for array access
   - All test cases with bracket notation (`[index]`) fail with syntax errors
   - Error message: `Expected ".", ">>", "}}", [a-zA-Z0-9_], or whitespace but "[" found`

2. **Version 3.3.0**:
   - Successfully parses and processes bracket notation for array access
   - AST correctly represents array indices as fields with `type: "index"` and `value: <number>`
   - Still has issues with variable indices (e.g., `fruits[index]`) - fails with error: `Expected "@call", "@embed", "@run", "[", "[[", "{", "{{", or whitespace but "1" found`

### AST Structure Changes

In version 3.3.0, array access is represented in the AST as:

```json
{
  "type": "DataVar",
  "identifier": "fruits",
  "varType": "data",
  "fields": [
    {
      "type": "index",
      "value": 0
    }
  ]
}
```

This structure allows for direct array indexing, which was not supported in version 3.0.1.

## Test Cases

We created three test cases to demonstrate the differences:

1. **Simple Array Access** (`array-notation-simple.meld`):
   - Version 3.0.1: ❌ Fails with syntax error
   - Version 3.3.0: ✅ Successfully parses and generates correct AST

2. **Nested Array Access** (`array-notation-nested.meld`):
   - Version 3.0.1: ❌ Fails with syntax error
   - Version 3.3.0: ✅ Successfully parses and generates correct AST

3. **Variable Index Access** (`array-variable-index.meld`):
   - Version 3.0.1: ❌ Fails with syntax error
   - Version 3.3.0: ❌ Fails with different syntax error

## Conclusion

The primary regression between versions 3.0.1 and 3.3.0 appears to be a fundamental change in how array access is handled. Version 3.3.0 introduces support for bracket notation (`[index]`), which was not available in 3.0.1.

This change likely causes cascading failures in existing code that may have used alternative approaches to access array elements in 3.0.1. Any code that relied on the previous behavior or error handling would need to be updated to work with the new array notation support in 3.3.0.

The variable index access case still fails in both versions, but with different error messages, suggesting that dynamic array indexing is not fully supported even in 3.3.0. 