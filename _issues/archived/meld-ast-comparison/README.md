# meld-ast Version Comparison

This directory contains the analysis of differences between meld-ast versions 3.0.1 and 3.3.0, focusing on the regressions observed in the newer version.

## Directory Structure

- `final-report.md` - Comprehensive analysis of the differences between versions
- `regression-report.md` - Initial findings on the regression analysis
- `array-notation-failures.md` - List of files affected by array notation changes
- `specific-cases/` - Test cases and analysis scripts
  - `array-notation-simple.meld` - Simple array access test
  - `array-notation-nested.meld` - Nested array access test
  - `array-variable-index.meld` - Variable index access test
  - `3.0.1/` - Analysis results for version 3.0.1
  - `3.3.0/` - Analysis results for version 3.3.0
  - `comparison-report.md` - Comparison of AST outputs

## Key Findings

The primary regression between versions 3.0.1 and 3.3.0 is a fundamental change in how array access is handled:

1. Version 3.0.1 does not support bracket notation for array access
2. Version 3.3.0 introduces support for bracket notation
3. This change affects at least 7 test files with 52 occurrences of array notation

## How to Use This Analysis

1. Read the `final-report.md` for a comprehensive understanding of the differences
2. Examine the specific test cases in the `specific-cases/` directory
3. Use the `array-notation-failures.md` to identify files that need to be updated

## Scripts

The following scripts were used for this analysis:

- `scripts/identify-array-notation-failures.js` - Identifies files using array notation
- `scripts/simple-test-cases.js` - Creates and analyzes test cases

## Running the Analysis

To rerun the analysis:

1. Install meld-ast@3.0.1 and run the analysis script:
   ```
   npm install meld-ast@3.0.1
   node meld-ast-comparison/specific-cases/3.0.1/analyze.js
   ```

2. Install meld-ast@3.3.0 and run the analysis script:
   ```
   npm install meld-ast@3.3.0
   node meld-ast-comparison/specific-cases/3.3.0/analyze.js
   ```

3. Generate the comparison report:
   ```
   node meld-ast-comparison/specific-cases/compare-results.js
   ``` 