# meld-ast Regression Analysis

This directory contains a comprehensive analysis of the regressions observed when upgrading from meld-ast version 3.0.1 to 3.3.0. Our investigation focused on understanding the root causes of test failures, particularly how array notation handling changed between versions.

## Key Documents

- **[VERSION-COMPARISON.md](./VERSION-COMPARISON.md)** - Primary summary of findings and recommendations
- **[ADDITIONAL-INSIGHTS.md](./ADDITIONAL-INSIGHTS.md)** - Security implications and notation support clarification
- **[final-report.md](./meld-ast-comparison/final-report.md)** - Detailed technical analysis of the differences
- **[regression-report.md](./meld-ast-comparison/regression-report.md)** - Initial findings on the regressions
- **[array-notation-failures.md](./meld-ast-comparison/array-notation-failures.md)** - List of files affected by array notation changes

## Test Cases

We created several test cases to demonstrate the differences between versions:

- **[specific-cases/array-notation-simple.meld](./meld-ast-comparison/specific-cases/array-notation-simple.meld)** - Simple array access
- **[specific-cases/array-notation-nested.meld](./meld-ast-comparison/specific-cases/array-notation-nested.meld)** - Nested array access
- **[specific-cases/array-variable-index.meld](./meld-ast-comparison/specific-cases/array-variable-index.meld)** - Variable index access

## Analysis Scripts

The following scripts were used to perform the analysis:

- **[compare-meld-ast-versions.js](./compare-meld-ast-versions.js)** - Main comparison script
- **[extract-test-failures.js](./extract-test-failures.js)** - Extracts and analyzes test failures
- **[simple-test-cases.js](./simple-test-cases.js)** - Creates and analyzes test cases
- **[identify-array-notation-failures.js](./identify-array-notation-failures.js)** - Identifies files using array notation

## Summary of Findings

1. **Version 3.0.1** did not support bracket notation (`[index]`) at all
2. **Version 3.3.0** supports both bracket notation and dot notation, but with a different AST representation
3. The key change is the introduction of a field type `"index"` in the AST
4. 7 test files with approximately 52 occurrences of array notation are affected
5. Variable index access (e.g., `array[variableName]`) is still problematic in both versions
6. The new AST structure provides significant security benefits through enhanced type safety

## Conclusion

The regressions are due to a structural change in how array access is represented in the AST, not bugs in meld-ast itself. Since backward compatibility is not required and there are no external users yet, updating the tests to account for the new AST structure should resolve the issues. 