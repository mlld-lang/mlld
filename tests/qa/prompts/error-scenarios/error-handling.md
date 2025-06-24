# Error Handling Test Prompt

## Objective
Test mlld's error handling capabilities to ensure users receive helpful, actionable error messages.

## Test Instructions

### 1. Syntax Errors

Test various syntax errors and document the error messages:

```mlld
# Missing closing quote
@text broken = "hello world

# Missing assignment operator
@text name "value"

# Invalid directive name
@invalid directive = "test"

# Unclosed brackets
run [echo "hello"

# Missing variable name
@text = "anonymous"
```

**For each error:**
- Is the error message clear?
- Does it point to the correct line/column?
- Does it suggest a fix?

### 2. Runtime Errors

Test runtime error scenarios:

```mlld
# Undefined variable reference
@add @undefined_variable

# File not found
@path missing = "./does-not-exist.md"
@add @missing

# Invalid command
run [this-command-does-not-exist]

# Permission denied (create read-only file first)
run [touch readonly.txt && chmod 444 readonly.txt]
@path content = "./readonly.txt"
@text content = "new content"
@output { file: "./readonly.txt" }
@add @content
```

### 3. Type Errors

Test type mismatch scenarios:

```mlld
# Field access on primitive
@data number = 42
@add [[Value: {{number.field}}]]

# Array operations on non-array
@data obj = {"key": "value"}
@text template(x) = [[Item: {{x}}]]
@data result = foreach @template(@obj)

# Invalid data in foreach
@text name = "not an array"
@data result = foreach @some_template(@name)
```

### 4. Import Errors

Test import failure scenarios:

```mlld
# Circular imports (create two files that import each other)
# file1.mld: @import { var } from "./file2.mld"
# file2.mld: @import { var } from "./file1.mld"

# Import non-existent file
@import { something } from "./missing-file.mld"

# Import non-existent variable
@import { nonexistent } from "./valid-file.mld"

# Module not found
@import { func } from @author/missing-module
```

### 5. Security Errors

Test security violations:

```mlld
# Path traversal attempt
@path sensitive = "../../../etc/passwd"
@add @sensitive

# Command injection attempt
@text user_input = "; rm -rf /"
run [echo {{user_input}}]

# Blocked URL access (if URL restrictions are configured)
@text content = @url "http://malicious-site.com"
```

### 6. Resource Errors

Test resource limit scenarios:

```mlld
# Very deep recursion
@text a = @b
@text b = @c
@text c = @d
# ... continue to create deep chain
@add @a

# Memory exhaustion (large data)
@data huge = [/* generate array with 1 million elements */]

# Infinite loop in foreach
# Create scenario that might cause infinite processing
```

### 7. Error Recovery

Test if mlld can recover from errors:

1. Create a file with multiple errors
2. Fix one error at a time
3. Document if subsequent errors are reported correctly
4. Check if partial output is generated before errors

### 8. Error Message Quality

For each error encountered, evaluate:

1. **Clarity**: Is the error message understandable?
2. **Location**: Does it show where the error occurred?
3. **Context**: Does it show surrounding code?
4. **Suggestion**: Does it suggest how to fix it?
5. **Type**: Is the error type appropriate?

Rate each error message on a scale of 1-5 for:
- Clarity
- Helpfulness
- Accuracy

## Reporting

Create issues for:
1. Cryptic or unclear error messages
2. Missing error location information
3. Errors that crash mlld instead of being handled
4. Incorrect error types
5. Missing helpful suggestions

Include in each issue:
- The exact mlld code that caused the error
- The full error message received
- What you expected the error message to say
- Suggestions for improvement

## Cleanup

After completing tests:
1. Delete all test `.mld` files created
2. Remove `readonly.txt` and any other test files
3. Clean up any test directories
4. Ensure no test artifacts remain