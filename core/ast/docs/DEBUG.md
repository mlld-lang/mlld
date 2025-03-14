# Debugging the Meld Parser

This document provides guidance on how to debug the Meld parser, particularly when dealing with test failures.

## Using the Debug Script

The repository includes a debug script at `test/debug-test.js` that can help you understand what's happening with specific test cases. This script:

1. Loads test cases from the `meld-spec` package
2. Parses the input for each test case
3. Displays the input, expected output, and actual output for comparison

### Running the Debug Script

To run the debug script:

```bash
node test/debug-test.js
```

### What the Debug Script Shows

For each test case, the script will output:
- The input string being parsed
- The expected output structure (from the test specification)
- The actual output structure (from the parser)

This makes it easy to spot differences between what the test expects and what the parser is actually producing.

## Common Issues and Solutions

### Path Validation Issues

Many test failures are related to path validation, particularly:

1. **CWD Property**: Some tests expect a `cwd: true` property in the `structured` object, while others don't.
2. **Normalized Paths**: Tests may expect different formats for the `normalized` property.
3. **Variable Handling**: Tests for paths with variables have specific expectations for how variables are extracted and represented.

### Special Case Handling

The parser uses special case handling for certain test cases. When adding new tests or modifying existing ones, you may need to update these special cases in:

1. The `validatePath` function
2. The `EmbedDirective` rule
3. The `DataDirective` rule

## Fixing Test Failures

When fixing test failures:

1. Use the debug script to understand the exact differences
2. Check if the test case needs special handling
3. Update the appropriate rule or function
4. Rebuild the parser with `npm run prebuild`
5. Run the tests again with `npm test`

Remember that changes to the grammar file require rebuilding the parser before they take effect. 