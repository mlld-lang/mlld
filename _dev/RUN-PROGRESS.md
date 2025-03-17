# Run Directive Implementation Progress

## Completed Features

### 1. Command References via AST
We've implemented proper command reference handling through the AST:
- Added `CommandReference` rule in grammar to parse `$commandName("arg1", "arg2")`
- Command arguments are now properly parsed as structured objects with types:
  - String literals: `{ type: 'string', value: 'hello' }`
  - Variable references: `{ type: 'variable', value: varRef }`
  - Raw arguments: `{ type: 'raw', value: 'someValue' }`
- The `RunDirectiveHandler` now handles this structured format, extracting parameters and applying them to command templates
- Added test coverage for all parameter types, including:
  - String literals
  - Variable references
  - Arguments with commas inside quotes
  - Mixed argument types

### 2. Multi-line Run Directives
Added support for multi-line run directives with double-bracket syntax:
- `@run [[...multiline content...]]` captures content verbatim without interpreting it as Meld
- Content is written to a temporary file and executed as a shell script
- Added tests verifying proper handling of multi-line content

### 3. Language-specific Run Directives
Added support for specifying the script language:
- `@run javascript [[...js code...]]` specifies the language to use for execution
- Different file extensions and interpreters are used based on language:
  - javascript/js: `.js` with `node`
  - python/py: `.py` with `python`
  - Default (bash): `.sh` with direct execution
- Added tests for language-specific execution

### 4. Parameter Passing to Scripts
Added support for passing variables to scripts:
- `@run ({{parameter1}}, {{parameter2}}) [[...script...]]` passes variables as arguments
- Parameters are resolved and passed to the script as command-line arguments
- For bash scripts, parameters are available as positional parameters ($1, $2, etc.)
- Added tests to verify parameter passing works correctly

## Current Status

All new unit tests are passing, confirming that the implementation works correctly in isolation. 
However, several integration and e2e tests are failing due to expectation mismatches.

### Outstanding Issues

1. **Test Expectation Mismatches**:
   - The e2e tests expect raw parameter strings to be output (showing the command reference syntax exactly as input)
   - Our implementation now properly substitutes parameters into commands, resolving to the actual output
   - We need to update test expectations to match this behavior

2. **AST Format Changes**:
   - Command references now use a structured object format instead of strings
   - Tests expecting string format need to be updated to work with the new structure
   - Some tests are checking for exact format matches that are no longer valid

3. **Backward Compatibility**:
   - Legacy code expected `$command` to be a string, but it's now an object
   - We may need additional handling in the DirectiveHandler to support both formats

## Next Steps

1. **Update Test Expectations**:
   - Fix the failing tests by updating their expectations to match the new behavior
   - For e2e tests, update expected outputs to show resolved parameters instead of raw syntax

2. **Improve Backward Compatibility**:
   - Add fallback handling in the RunDirectiveHandler for string-format command references
   - Ensure all existing tests pass with the new implementation

3. **Additional Testing**:
   - Test more complex scenarios, such as nested variable references
   - Test edge cases like empty parameters, special characters, etc.
   - Create integration tests to verify end-to-end functionality

4. **Documentation**:
   - Update user documentation to reflect the new functionality
   - Add examples of multi-line scripts and parameter passing