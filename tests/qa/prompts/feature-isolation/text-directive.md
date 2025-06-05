# @text Directive Isolation Test Prompt

## Objective
Test the @text directive in isolation to ensure all its features work correctly.

## Test Instructions

Please perform the following tests for the @text directive:

### 1. Basic Assignment Tests

Create a test file `test-text.mld` and test:

```mlld
@text simple = "Hello World"
@add @simple
```

**Expected**: Should output "Hello World"

### 2. Template Tests

Test templates with variable interpolation:

```mlld
@text name = "Alice"
@text greeting = [[Hello, {{name}}!]]
@add @greeting
```

**Expected**: Should output "Hello, Alice!"

### 3. Multiline Template Tests

```mlld
@text title = "My Document"
@text content = [[
# {{title}}

This is a multiline template.
It should preserve formatting.
]]
@add @content
```

**Expected**: Should preserve line breaks and formatting

### 4. Assignment from Other Directives

Test assignment from @path:
```mlld
@path readme = "./README.md"
@text content = @readme
@add @content
```

Test assignment from @run:
```mlld
@text timestamp = @run [date +%Y-%m-%d]
@add @timestamp
```

Test assignment from @add:
```mlld
@add "Original content" >> section
@text saved = @add:section
@add @saved
```

### 5. Edge Cases

Test each of these edge cases:
- Empty string: `@text empty = ""`
- Special characters: `@text special = "Hello \"World\" with 'quotes'"`
- Unicode: `@text unicode = "Hello 世界 🌍"`
- Long strings (1000+ characters)
- Variable names with underscores: `@text my_var = "test"`
- Variable names with numbers: `@text var123 = "test"`

### 6. Error Cases

Test these scenarios and verify appropriate error messages:
- Undefined variable: `@add @undefined_var`
- Invalid syntax: `@text = "missing name"`
- Redefinition: Define same variable twice
- Circular reference: `@text a = @b` and `@text b = @a`

## Reporting

For each test:
1. Note if it behaves as expected
2. Document any unexpected behavior
3. Record exact error messages
4. Note any performance issues

Create a GitHub issue if you find:
- Behavior that differs from documentation
- Unclear or unhelpful error messages
- Performance problems
- Crashes or hangs

## Cleanup

After completing tests:
1. Delete any test files created (`test-text.mld`, etc.)
2. Remove any generated output files
3. Clear any test directories created
4. Ensure no test artifacts remain in the working directory