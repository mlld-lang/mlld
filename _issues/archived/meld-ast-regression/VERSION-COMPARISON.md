# meld-ast Version Comparison: 3.0.1 vs 3.3.0

## Introduction

This document summarizes our investigation into the regressions observed when upgrading from meld-ast 3.0.1 to 3.3.0. Our analysis focused on understanding the root causes of these regressions, particularly how array access notation is handled between versions.

## Version History Context

According to the meld-ast changelog:

1. **Version 3.0.1**: Base version that didn't support bracket notation for arrays
2. **Version 3.1**: Added support for bracket notation `[index]`
3. **Version 3.3.0**: Made changes to the notation implementation

## Key Findings

Our analysis revealed several important differences:

### 1. Array Notation Parsing

- **Version 3.0.1**: Does not support bracket notation (`[index]`) at all. Any attempt to use it results in a syntax error: `Expected ".", ">>", "}}", [a-zA-Z0-9_], or whitespace but "[" found`

- **Version 3.3.0**: Supports bracket notation for array access. Contrary to initial assumptions, this version does parse bracket notation successfully, but it uses a different internal representation in the AST.

### 2. AST Structure Changes

The most significant difference is in how array access is represented in the AST:

- **Version 3.0.1**: No representation for array access (since it wasn't supported)

- **Version 3.3.0**: Array access is represented with a new field type `"index"`. For example:
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

### 3. Limitations in Both Versions

- Variable index access (e.g., `array[variableName]`) fails in both versions, but with different error messages
- This suggests that dynamic array indexing is not fully supported in either version

## Impact on Tests

We identified 7 test files with approximately 52 occurrences of array notation that are affected by this change. The test failures are not because bracket notation is unsupported in 3.3.0, but because:

1. The AST structure changed fundamentally
2. Test assertions may be expecting the 3.0.1 behavior (error) or a different AST structure

## Recommendations

Since backward compatibility is not required and there are no external users yet:

1. **Update Tests**: Modify test assertions to match the new AST structure in 3.3.0
2. **Document Changes**: Maintain documentation about this AST structure change for future reference
3. **Add Specific Tests**: Add tests for array notation to prevent future regressions
4. **Consider Dynamic Indexing**: Be aware that variable index access is still problematic

## Conclusion

The regressions observed when upgrading from meld-ast 3.0.1 to 3.3.0 are due to a fundamental change in how array access is represented in the AST, not because of bugs in meld-ast itself. The key change is that 3.3.0 supports bracket notation syntax with a new internal representation, while 3.0.1 didn't support bracket notation at all.

All test files that contain bracket notation need to be updated to account for this new structure. Since backward compatibility is not required, this should be a straightforward update process. 