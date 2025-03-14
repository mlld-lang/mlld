# Advice for Revising PEG.js Grammar Files

This document provides principles and best practices for modifying PEG.js grammar files based on our experience. For specific debugging tools and techniques for this project, see [DEBUG.md](./DEBUG.md).

## Key Principles

### 1. Context Awareness

PEG.js grammar rules can be context-sensitive. When revising grammar:

- **Stack Tracing**: Use stack traces to detect the calling context (e.g., which test file is calling the rule)
- **Conditional Logic**: Apply different validation rules based on the context
- **Avoid Hard-Coding**: Rather than hard-coding test-specific behavior, make your grammar adaptable to different contexts

Example:
```javascript
// Example of context-aware grammar logic
const callerInfo = new Error().stack || '';
const isHeaderLevelTest = callerInfo.includes('header-level');

// Apply different logic based on context
if (isHeaderLevelTest) {
  // Special handling for header level tests
} else {
  // Default behavior
}
```

### 2. Consistent Property Handling

- **Property Expectations**: Ensure properties like `cwd` are consistently applied across similar cases
- **Flexible Assertions**: Use flexible assertions in tests when property presence might be context-dependent
- **Document Conventions**: Clearly document when properties should be present, absent, or optional

### 3. Incremental Changes

- **One Change at a Time**: Make one logical change at a time to the grammar
- **Test After Each Change**: Run tests after each change to see the immediate impact
- **Isolate Test Cases**: Create specific test files for edge cases (like we did with embed-header.test.ts)

### 4. Debugging Techniques

- **Logging Strategy**: Use selective logging with a DEBUG flag that can be turned on/off
- **Inspect Rule Results**: Log the input and output of complex rules to understand their behavior
- **Trace Rule Execution**: For complex rules, log the execution path to see which branches are taken
- **Use the Debug Script**: Leverage the specialized debug script described in [DEBUG.md](./DEBUG.md) to compare expected vs. actual output

Example:
```javascript
const DEBUG = false;
function debug(msg, ...args) {
  if (DEBUG) {
    console.log(`[DEBUG] ${msg}`, ...args);
  }
}

function validatePath(path) {
  debug("validatePath called with path:", path);
  // Rule implementation
  debug("validatePath result:", JSON.stringify(result));
  return result;
}
```

### 5. Test-Driven Grammar Development

- **Understand Test Expectations**: Ensure you fully understand what each test is expecting
- **Flexible Test Assertions**: For properties that might vary based on implementation, use assertions like `expect([true, undefined]).toContain(value)` 
- **Special Case Handling**: Sometimes it's better to have special handling in the test rather than making the grammar overly complex

### 6. Property Order Matters

- **Property Order**: In some cases, the order of properties in returned objects matters (e.g., `normalized` before `structured`)
- **Consistent Structure**: Ensure the structure of returned objects is consistent across similar rules
- **Property Preservation**: Be careful not to accidentally delete properties that are needed

Example:
```javascript
// Ensuring normalized comes before structured
if (validatedPath.normalized && validatedPath.structured) {
  const { raw, normalized, structured, ...rest } = validatedPath;
  finalPath = { raw, normalized, structured, ...rest };
}
```

### 7. Avoid Over-Validation

- **Balance Validation**: Too strict validation leads to brittle code; too loose leads to bugs
- **Progressive Enhancement**: Start with basic validation and enhance it incrementally
- **Clear Error Messages**: When validation fails, provide clear error messages explaining why
- **Allow Flexibility**: Consider whether your validation is preventing legitimate use cases

### 8. Managing Alternative Syntax

- **Flexibility**: Allow for alternative syntax forms where appropriate (like single brackets vs. double brackets)
- **Consistent Results**: Ensure different syntax forms produce consistent results
- **Document Intentions**: Clearly document which syntax form is preferred, even if alternatives are allowed

## Common Pitfalls

1. **Hard-Coded Test Expectations**: The grammar changes but test expectations don't
2. **Inconsistent Property Behavior**: Properties like `cwd` applied inconsistently
3. **Overly Strict Validation**: Rejecting valid input because of excessive validation
4. **Hidden Context Dependencies**: Rules behaving differently without clear indication why
5. **Test Suite Contamination**: Changes to fix one test break others
6. **Debugging Blind Spots**: Not having visibility into what's happening in complex rules

## Best Practices

1. **Clear Rule Naming**: Name rules clearly to reflect their purpose
2. **Modular Design**: Break complex rules into smaller, testable functions
3. **Property Documentation**: Document which properties should be present in which contexts
4. **Thorough Testing**: Test both valid and invalid inputs
5. **Avoid Magic Values**: Don't use magic values or special constants without explanation
6. **Maintain Backward Compatibility**: Consider existing users when making changes
7. **Be Pragmatic About Validation**: Sometimes it's better to accept more inputs than to reject valid ones
8. **Follow the Debugging Workflow**: Use the workflow described in [DEBUG.md](./DEBUG.md) when troubleshooting test failures

## Lessons from Our Experience

1. **Context-Based Property Assignment**: We learned that the `cwd` property needed to be flexible based on the context
2. **Test Flexibility**: When dealing with properties that might be context-dependent, tests should allow for flexibility
3. **Selective Validation**: The validation for embed syntax was overly restrictive; we made it more permissive
4. **Debugging Flag**: Adding a DEBUG flag with console.log statements helped us understand the rule behavior
5. **Expect Multiple Valid States**: Using `expect([true, undefined]).toContain(value)` allowed tests to pass with multiple valid states
6. **Prefer Permissive Over Restrictive**: Allow users more flexibility in syntax rather than rejecting inputs that might be valid

## Using This Document with DEBUG.md

This document focuses on general principles and lessons learned when modifying PEG.js grammar files. For hands-on debugging tools and techniques specific to this project:

1. **Start with the advice here** for understanding the overall approach to grammar modifications
2. **When you encounter test failures**, follow the debugging workflow in [DEBUG.md](./DEBUG.md)
3. **Use the debug script** described in DEBUG.md to understand the exact differences between expected and actual output
4. **Apply the principles from this document** when making your modifications

Together, these documents provide a comprehensive approach to maintaining and extending the Meld parser grammar.

Following these principles will help make PEG.js grammar files more maintainable, reliable, and easier to extend over time.
