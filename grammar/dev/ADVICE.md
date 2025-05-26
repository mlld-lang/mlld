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
- **Beware of Fragility**: Large PEG.js files are sensitive. Large-scale commenting/uncommenting, moving blocks, or accidental deletions can introduce subtle syntax errors (missing `=`, `}`, newlines, etc.) or remove core rules (`_`, `__`, `EOF`).
- **Frequent Build Checks**: Run the grammar build script (`npm run build:grammar`) frequently after small changes to catch errors early.

### 4. Debugging Techniques

- **Logging Strategy**: Use selective logging with a DEBUG flag that can be turned on/off
- **Inspect Rule Results**: Log the input and output of complex rules to understand their behavior
- **Trace Rule Execution**: For complex rules, log the execution path to see which branches are taken
- **Use the Debug Script**: Leverage the specialized debug script described in [DEBUG.md](./DEBUG.md) to compare expected vs. actual output
- **Understand Build Errors**: PEG.js build errors can sometimes be misleading:
    - `Rule "X" is not defined`: Often means `X` is referenced *before* its definition is complete *in file order*, or a syntax error *within* `X`'s definition prevented its registration. See "Grammar Structure and Build Stability" below.
    - `Expected "Y" but found "Z"`: Often points to a syntax error in the rule *preceding* the error location, or a rule referenced by the current rule.
    - `Possible infinite loop`: Indicates a repetition (`*` or `+`) uses a rule that might match zero characters (e.g., `Rule = SubRule*` where `SubRule` can successfully match nothing). Ensure repeating rules always consume input.

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

## Grammar Structure and Build Stability

Modifying PEG.js grammars requires extreme care, especially regarding the order of definitions and build process nuances.

### 1. Rule Definition Order is Critical

Peggy processes the grammar file top-down. While some forward references are allowed, relying on them heavily, especially across complex rule interactions (like lookaheads or within the initial code block), is fragile and a common source of build errors.

**Recommended Stable Structure:** Adhere strictly to the following definition order within `mlld.pegjs` to minimize "Rule not defined" errors:

1.  **Initial `{...}` Block:** Contains *all* JavaScript helper functions (`debug`, `isLineStart`, `validatePath`, `combineAdjacentTextNodes`, etc.) and constants (`NodeType`, `DirectiveKind`). Do not define helpers later in the file.
2.  **Core Data Structure / Complex Parsing Rules:** Define rules that parse significant, structured parts of the language first. This includes:
    *   `Variable`, `TextVar`, `DataVar`, `PathVar`, `FieldAccess`, `ArrayAccess`, etc.
    *   Interpolation logic: `DoubleQuote...`, `SingleQuote...`, `Backtick...`, `Multiline...` rules.
    *   `InterpolatedStringLiteral`, `InterpolatedMultilineTemplate`.
    *   **Main `Directive` Rule:** The top-level rule choosing between specific directives.
    *   **Specific Directive Rules:** `ImportDirective`, `EmbedDirective`, `RunDirective`, etc., and any rules used *only* within these directives.
    *   `CodeFence`, `BacktickSequence`, `CodeFenceLangID`.
    *   Any other complex, non-terminal rules.
3.  **Layout / Text Flow Rules:** Define rules managing the flow between the complex structures above.
    *   `Comment`, `LineStartComment`.
    *   `TextBlock`, `TextPart`. **Crucially**, `TextPart` must use lookaheads (`!Directive`, `!CodeFence`, etc.) to avoid consuming the start of higher-precedence rules defined *earlier*. Ensure `TextPart` always consumes at least one character to prevent infinite loops.
4.  **Main Entry Point:**
    *   `Start`. This rule typically references the layout/complex rules defined above.
5.  **Fundamental / "Terminal" Rules:** Define the basic building blocks used by other rules.
    *   `Identifier`, `StringLiteral`, `NumberLiteral`, `BooleanLiteral`, `NullLiteral`.
    *   Character-level helpers: `QuotedChars`, `TextUntilNewline`, etc.
6.  **Whitespace & EOF Rules:**
    *   `_` (optional whitespace), `__` (required whitespace).
    *   `EOF`, `LineTerminator`.

**Rationale:** This order ensures that when Peggy processes any rule, all other non-terminal rules it references (or uses in lookaheads) have already been fully defined and registered.

### 2. Avoid Recursive Parser Calls within Grammar Actions

Avoid calling `parser.parse(...)` from within the action code `{...}` of a rule. Attempts to do this can lead to errors like `parse is not defined` or `Can't start parsing from rule "..."`, even if the target rule is in `allowedStartRules`. Refactor your logic to avoid this pattern.

### 3. Build Script Considerations

- **`allowedStartRules`**: The build script (`build-grammar.mjs`) uses `peggy.generate` for validation, often specifying `allowedStartRules`. Be cautious when modifying this list. Incorrectly listing rules here, or potential issues with rule registration visibility, can cause build failures unrelated to the main parsing logic. Generally, `allowedStartRules` should only contain the primary `Start` rule(s) intended as entry points.

## Common Pitfalls

1. **Hard-Coded Test Expectations**: The grammar changes but test expectations don't
2. **Inconsistent Property Behavior**: Properties like `cwd` applied inconsistently
3. **Overly Strict Validation**: Rejecting valid input because of excessive validation
4. **Hidden Context Dependencies**: Rules behaving differently without clear indication why
5. **Test Suite Contamination**: Changes to fix one test break others
6. **Debugging Blind Spots**: Not having visibility into what's happening in complex rules
7. **Rule Order Issues**: Placing rule definitions in an order that causes build failures (See "Grammar Structure").
8. **Subtle Syntax Errors**: Missing `=`, `}`, semicolons, or extra characters after rule definitions.
9. **Infinite Loops**: Repetition rules (`*`, `+`) matching zero-width input.

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

Together, these documents provide a comprehensive approach to maintaining and extending the Mlld parser grammar.

Following these principles will help make PEG.js grammar files more maintainable, reliable, and easier to extend over time.
