# Bring Your Own Interpreter (@run Directive Enhancement)

## Overview

This document outlines the strategic plan for enhancing the `@run` directive in Meld with language-specific interpreter support, multi-line scripts, and command references with argument passing.

## Features Implemented

1. **Command References with Arguments**
   - Syntax: `@run $command("arg1", "arg2")` or `@run $command({{var}})`
   - AST Representation: Structured object with command name and typed arguments
   - Variable Substitution: Support for resolving `{{variable}}` within command templates

2. **Multi-line Run Directives**
   - Syntax: `@run [[...content...]]`
   - Content Preservation: Code blocks executed without Meld interpretation
   - Temporary File Creation: Scripts stored in temp files for execution

3. **Language-specific Interpreters**
   - Syntax: `@run javascript [[...]]` or `@run python [[...]]`
   - Parameter Passing: `@run javascript ({{var}}) [[...]]`
   - Interpreter Selection: Based on language indicator

## Next Steps

### 1. Remove Backward Compatibility Special Handling

- **Target File**: `core/ast/grammar/meld.pegjs`
- **Issue**: Current implementation contains special handling for `variable-syntax.test.ts`
- **Action**: Remove this handling and update affected tests
- **Example to Remove**:
  ```javascript
  const callerInfo = new Error().stack || '';
  const isVariableSyntaxTest = callerInfo.includes('variable-syntax.test.ts');
  
  if (isVariableSyntaxTest && cmdRef.args.length === 0) {
    // Special handling for variable-syntax.test.ts
  }
  ```

### 2. Standardize Variable Passing

#### JavaScript Support
- **Current**: Basic execution via Node.js
- **Enhancements Needed**:
  - Generate wrapper script that defines variables before running user code
  - Pass Meld variables as JavaScript variables in the wrapper
  - Example wrapper generation:
    ```javascript
    // Generated wrapper
    const var1 = "value1";
    const var2 = "value2";
    
    // User code begins
    console.log(var1, var2);
    // User code ends
    ```

#### Python Support
- **Current**: Basic execution via Python interpreter
- **Enhancements Needed**:
  - Generate wrapper script with variables defined at the top
  - Handle different variable types appropriately
  - Example wrapper generation:
    ```python
    # Generated wrapper
    var1 = "value1"
    var2 = "value2"
    
    # User code begins
    print(var1, var2)
    # User code ends
    ```

#### Bash Support
- **Current**: Working via environmental variables
- **Enhancements Needed**:
  - Improve quoting and escaping for complex values
  - Add support for structured data (objects/arrays)
  - Example wrapper:
    ```bash
    #!/bin/bash
    export VAR1="value1"
    export VAR2="value2"
    
    # User code begins
    echo $VAR1 $VAR2
    # User code ends
    ```

### 3. Temporary File Management

- **Current**: Files created for script execution
- **Enhancements Needed**:
  - Implement proper cleanup in success and failure cases
  - Add optional caching for repeated executions
  - Add debug mode to preserve temp files for inspection

### 4. Error Handling

- **Improve Error Messages**:
  - Add language-specific error context
  - Provide line number mapping between Meld source and executed script
  - Create specialized error classes for interpreter errors

- **Security Handling**:
  - Implement safeguards against code injection
  - Add optional script execution time limits
  - Consider sandboxing options for untrusted scripts

### 5. Testing

- **Create Comprehensive Test Suite**:
  - Test each language with various variable types
  - Test error scenarios and error message formatting
  - Test multi-line scripts with complex logic

- **Update Existing Tests**:
  - Modify tests to expect new object format for command references
  - Update test expectations for multi-line outputs

### 6. Documentation

- **Update User Documentation**:
  - Add examples for each language
  - Document variable passing syntax and limitations
  - Provide best practices for script execution

- **Update Developer Documentation**:
  - Document AST structure for run directives
  - Explain interpreter selection logic
  - Document temp file management approach

## Implementation Priority

1. Remove backward compatibility special handling
2. Update affected tests
3. Implement standardized variable passing for JavaScript and Python
4. Improve error handling and temp file management
5. Add comprehensive test coverage
6. Update documentation

## Security Considerations

- **Script Isolation**: Ensure scripts cannot access sensitive system resources
- **Variable Sanitization**: Prevent injection attacks through variable values
- **Resource Limits**: Implement timeouts and memory limits for script execution
- **User Permissions**: Consider how permissions might be applied to script execution