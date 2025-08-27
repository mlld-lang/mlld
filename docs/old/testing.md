# mlld Test System

The mlld test system provides a native way to write and run tests for mlld modules and applications.

## Quick Start

### Writing Tests

Create a `.test.mld` file anywhere in your project:

```mlld
>> my-module.test.mld
/import { eq, ok, includes } from "path/to/test.mld.md"

>> Test data
/var @input = ["apple", "banana", "cherry"]

>> Write tests as boolean variables with test_ prefix
/var @test_array_has_three_items = @eq(@len(@input), 3)
/var @test_includes_banana = @includes(@input, "banana")
/var @test_first_item_is_apple = @eq(@input.0, "apple")
```

### Running Tests

```bash
# Run all tests
mlld test

# Run tests matching a pattern
mlld test array           # Runs tests with "array" in the path
mlld test src/utils       # Runs all tests in src/utils/
mlld test parser.test.mld # Runs specific test file
```

## Test Assertions

The test module provides these assertion functions that return booleans:

### Basic Assertions
- `@eq(a, b)` - Strict equality (===)
- `@deepEq(a, b)` - Deep equality for objects/arrays
- `@ok(value)` - Truthy check
- `@notOk(value)` - Falsy check

### Comparison Assertions
- `@gt(a, b)` - Greater than
- `@gte(a, b)` - Greater than or equal
- `@lt(a, b)` - Less than
- `@lte(a, b)` - Less than or equal

### Container Assertions
- `@includes(container, item)` - Check if string/array contains item
- `@contains(haystack, needle)` - Alias for includes (better for strings)
- `@len(value)` - Get length of string/array/object

### Error Assertions
- `@throws(fn)` - Check if function throws an error

## Test Discovery

Tests are discovered using the following rules:
- Any variable starting with `test_` is considered a test
- Test files match the pattern `**/*.test.mld`
- Files in `node_modules/`, `.mlld-cache/`, and `mlld/tests/tmp/` are ignored

## Example Test File

```mlld
/import { eq, deepEq, ok, notOk, includes, len } from "../test.mld.md"

>> Test object equality
/var @user1 = {"name": "Alice", "age": 30}
/var @user2 = {"name": "Alice", "age": 30}
/var @test_users_are_equal = @deepEq(@user1, @user2)

>> Test array operations
/var @numbers = [1, 2, 3, 4, 5]
/var @test_array_length = @eq(@len(@numbers), 5)
/var @test_includes_three = @includes(@numbers, 3)

>> Test with exec functions
/exe @double(n) = javascript {return n * 2}
/var @doubled = foreach @double(@numbers)
/var @test_foreach_doubles = @deepEq(@doubled, [2, 4, 6, 8, 10])

>> Test falsy values
/var @test_empty_string_is_falsy = @notOk("")
/var @test_zero_is_falsy = @notOk(0)
/var @test_null_is_falsy = @notOk(null)
```

## Test Output

Tests produce colored output showing:
- ✓ Passed tests in green
- ✗ Failed tests in red
- File execution errors
- Test summary with total counts and timing

Example output:
```
Running tests...

src/utils
  ✓ parser.test.mld (15ms)
    ✓ parse basic
    ✓ parse complex
    ✗ parse edge cases

modules/array
  ✓ array.test.mld (8ms)
    ✓ filter works
    ✓ map works
    ✓ reduce works

Tests: 5 passed, 1 failed (6 total)
Time: 28ms
```

## Best Practices

1. **Name tests descriptively**: Use `test_` prefix followed by what's being tested
2. **One assertion per test**: Makes failures easier to understand
3. **Group related tests**: Use comments to organize tests into sections
4. **Test edge cases**: Empty arrays, null values, boundary conditions
5. **Keep tests fast**: Avoid slow operations in test files

## Limitations (MVP)

The current MVP implementation has these limitations:
- No setup/teardown support
- No test isolation (all tests in a file share the same environment)
- No async test support beyond what mlld naturally handles
- No mocking or stubbing
- No coverage reporting
- Sequential execution only

## Using the Test Module

The test module can be imported from:
1. Local file path: `"../../modules/core/test.mld.md"`
2. Registry module: `@mlld/test` (when published)

For local development, use relative imports until the module is published to the registry.