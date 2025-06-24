# @data Directive Isolation Test Prompt

## Objective
Test the @data directive in isolation to ensure all data types and operations work correctly.

## Test Instructions

Please perform the following tests for the @data directive:

### 1. Primitive Data Types

Create a test file `test-data.mld` and test each primitive type:

```mlld
@data string_val = "Hello World"
@data number_val = 42
@data float_val = 3.14159
@data bool_true = true
@data bool_false = false
@data null_val = null

@add [[
String: {{string_val}}
Number: {{number_val}}
Float: {{float_val}}
True: {{bool_true}}
False: {{bool_false}}
Null: {{null_val}}
]]
```

**Expected**: Each value should render correctly

### 2. Arrays

Test array operations:

```mlld
@data simple_array = [1, 2, 3, 4, 5]
@data mixed_array = ["text", 42, true, null]
@data nested_array = [[1, 2], [3, 4], [5, 6]]

@add [[
Simple: {{simple_array}}
Mixed: {{mixed_array}}
Nested: {{nested_array}}
First element: {{simple_array.0}}
Last element: {{simple_array.4}}
]]
```

### 3. Objects

Test object operations:

```mlld
@data user = {
  "name": "Alice",
  "age": 30,
  "active": true,
  "tags": ["developer", "team-lead"]
}

@data nested = {
  "level1": {
    "level2": {
      "level3": "deep value"
    }
  }
}

@add [[
Name: {{user.name}}
Age: {{user.age}}
Active: {{user.active}}
First tag: {{user.tags.0}}
Deep value: {{nested.level1.level2.level3}}
]]
```

### 4. Field Access

Test various field access patterns:

```mlld
@data config = {
  "database": {
    "host": "localhost",
    "port": 5432,
    "credentials": {
      "username": "admin",
      "password": "secret"
    }
  },
  "features": ["auth", "api", "ui"]
}

@text host = @config.database.host
@text port = @config.database.port
@text username = @config.database.credentials.username
@text first_feature = @config.features.0

@add [[
Database: {{host}}:{{port}}
User: {{username}}
Feature: {{first_feature}}
]]
```

### 5. Complex Data Operations

Test foreach with data:

```mlld
@data numbers = [1, 2, 3, 4, 5]
@text template(n) = [[Number: {{n}}]]
@data results = foreach @template(@numbers)
@add @results
```

Test data from command output:

```mlld
@data json_data = run [echo '{"key": "value"}']
@add [[JSON key: {{json_data.key}}]]
```

### 6. Edge Cases

Test each edge case:
- Empty array: `@data empty = []`
- Empty object: `@data empty = {}`
- Very large array (1000+ elements)
- Very deep nesting (10+ levels)
- Special characters in keys: `@data special = {"key-with-dash": "value"}`
- Numeric string keys: `@data numeric = {"123": "value"}`
- Array of objects: `@data items = [{"id": 1}, {"id": 2}]`

### 7. Error Cases

Test these error scenarios:
- Invalid JSON: `@data bad = {"missing": "quote}`
- Invalid field access: `@data x = {}` then `{{x.nonexistent.field}}`
- Type mismatch: `@data num = 42` then `{{num.field}}`
- Array index out of bounds: `@data arr = [1, 2]` then `{{arr.10}}`
- Invalid foreach operation on non-array

## Reporting

For each test:
1. Verify data is parsed correctly
2. Check field access works as expected
3. Note any type coercion behavior
4. Document error messages
5. Check performance with large data structures

Report issues for:
- JSON parsing failures
- Incorrect field access behavior
- Poor error messages
- Performance degradation
- Type handling inconsistencies

## Cleanup

After completing tests:
1. Delete all test files created (`test-data.mld`, etc.)
2. Remove any output files generated during testing
3. Clean up any temporary directories
4. Ensure working directory is restored to original state