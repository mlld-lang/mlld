# Testing modules

mlld provides a native test system designed for the unique needs of LLM orchestration and dynamic workflows.

## Quick Start

Create a `modulename.test.mld` file:

```mlld
/var @data = ["apple", "banana", "cherry"]
/var @test_array_has_items = @data.length() > 0
/var @test_includes_banana = @data.includes("banana")
/var @test_first_item = @data[0] == "apple"
```

Run tests:

```bash
mlld test                    # All tests
mlld test utils/             # Tests in utils/
mlld test parser.test.mld    # Specific file
```

## Test Structure

### Test Discovery

Tests are discovered automatically:
- Files ending in `.test.mld` 
- Variables are seen as tests
- Variables evaluated as true pass; false fails

```mlld
# This variable is a test
/var @test_basic_math = 2 + 2 == 4

# This variable is not a test
/var @helper_data = [1, 2, 3]

# This is also a test
/var @test_array_length = @helper_data.length() == 3
```

### Test Results

Tests pass when the variable evaluates to `true` (or truthy):

```mlld
/var @test_passes = true
/var @test_also_passes = "hello"      # Truthy string
/var @test_fails = false
/var @test_also_fails = ""            # Falsy string
```

## Writing Tests

### Basic Assertions

The test module provides these assertion functions that return booleans:

#### Basic Assertions
- `@eq(a, b)` - Strict equality (===)
- `@deepEq(a, b)` - Deep equality for objects/arrays
- `@ok(value)` - Truthy check
- `@notOk(value)` - Falsy check

#### Comparison Assertions
- `@gt(a, b)` - Greater than
- `@gte(a, b)` - Greater than or equal
- `@lt(a, b)` - Less than
- `@lte(a, b)` - Less than or equal

#### Container Assertions
- `@includes(container, item)` - Check if string/array contains item
- `@contains(haystack, needle)` - Alias for includes (better for strings)
- `@len(value)` - Get length of string/array/object

### Testing Functions

Test `/exe` functions by calling them:

```mlld
/exe @greet(name) = `Hello, @name!`
/exe @double(n) = js { return n * 2 }

/var @test_greet_works = @greet("Alice") == "Hello, Alice!"
/var @test_double_works = @double(5) == 10
/var @test_double_zero = @double(0) == 0
```

### Testing Commands

Test command execution by capturing output:

```mlld
/var @result = run {echo "test"}
/var @test_echo_works = @result.trim() == "test"

# Test JavaScript execution
/var @js_result = js { return "computed" }
/var @test_js_execution = @js_result == "computed"
```

### Testing with File Operations

Test file loading and processing:

```mlld
# Assuming test data files exist
/var @config = <test-config.json>
/var @readme = <test-readme.md>

/var @test_config_loaded = @config != null
/var @test_has_title = @config.title == "Test Config"
/var @test_readme_has_content = @readme.length() > 0
```

### Testing Conditionals

Test `/when` logic by checking outcomes:

```mlld
/var @user = {"role": "admin", "active": true}
/var @result = ""

/when [
  @user.role == "admin" && @user.active => @result = "admin-access"
  @user.role == "user" => @result = "user-access"
  none => @result = "no-access"
]

/var @test_admin_access = @result == "admin-access"
```

### Testing Loops and Iteration

Test `/for` loops and `foreach`:

```mlld
/var @numbers = [1, 2, 3, 4, 5]
/exe @square(n) = js { return n * n }

# Test foreach transformation
/var @squared = foreach @square(@numbers)
/var @test_foreach_length = @squared.length() == 5
/var @test_first_square = @squared[0] == 1
/var @test_last_square = @squared[4] == 25

# Test for loop collection
/var @doubled = for @n in @numbers => js { return @n * 2 }
/var @test_doubled_sum = @doubled[0] + @doubled[1] == 6  # 2 + 4
```

## Running Tests

### Basic Commands

```bash
# Run all tests in project
mlld test

# Run tests matching pattern  
mlld test auth                # Files/paths containing "auth"
mlld test src/utils/          # All tests in directory
mlld test validation.test.mld # Specific test file
```

### Test Output

Tests show results as they run:

```
Running tests...

src/utils
  ✓ validation.test.mld (12ms)
    ✓ user validation works
    ✓ email format check
    ✗ password strength

modules/auth  
  ✓ auth.test.mld (8ms)
    ✓ login flow
    ✓ logout clears session

Tests: 4 passed, 1 failed (5 total)
Time: 23ms
```

### Environment Variables

Load environment variables for tests:

```bash
# Load specific env file
mlld test --env .env.test

# Auto-loads .env and .env.test from current directory
mlld test
```

Test files can access allowed environment variables:

```mlld
/import { MLLD_API_KEY, MLLD_NODE_ENV } from @input
/var @test_has_api_key = @MLLD_API_KEY != null
/var @test_test_environment = @MLLD_NODE_ENV == "test"
```

## Best Practices

### Test Naming

Use descriptive test names:

```mlld
# ✅ Good - descriptive names
/var @test_user_validation_requires_email = ...
/var @test_password_must_be_8_characters = ...
/var @test_admin_can_delete_posts = ...

# ❌ Bad - unclear names  
/var @test_validation = ...
/var @test_user = ...
/var @test_1 = ...
```

### Keep Tests Focused

Write focused tests that check one thing:

```mlld
# ✅ Good - one assertion per test
/var @test_array_length = @data.length() == 3
/var @test_first_item = @data[0] == "apple"
/var @test_includes_banana = @data.includes("banana")

# ❌ Bad - multiple assertions in one test
/var @test_array_stuff = @data.length() == 3 && @data[0] == "apple" && @data.includes("banana")
```

### Test Edge Cases

Include boundary conditions and edge cases:

```mlld
/exe @calculateDiscount(price, percent) = when [
  @price <= 0 => 0
  @percent < 0 => @price
  @percent > 100 => 0
  * => js { return @price * (100 - @percent) / 100 }
]

# Test normal cases
/var @test_normal_discount = @calculateDiscount(100, 10) == 90

# Test edge cases
/var @test_zero_price = @calculateDiscount(0, 10) == 0
/var @test_negative_price = @calculateDiscount(-50, 10) == 0
/var @test_negative_percent = @calculateDiscount(100, -5) == 100
/var @test_over_100_percent = @calculateDiscount(100, 150) == 0
```

### Use Helper Functions

Create reusable test helpers:

```mlld
/exe @assertEq(actual, expected) = @actual == @expected
/exe @assertContains(container, item) = @container.includes(@item)
/exe @assertLength(array, expectedLength) = @array.length() == @expectedLength

# Use helpers in tests
/var @test_user_name = @assertEq(@user.name, "Alice")
/var @test_tags_include_admin = @assertContains(@user.tags, "admin")
/var @test_permissions_count = @assertLength(@user.permissions, 3)
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install -g @mlld/cli
      - run: mlld test
```

### Environment Setup

Set up test environments in CI:

```bash
# Install dependencies
npm install -g @mlld/cli

# Set test environment variables
export MLLD_NODE_ENV=test
export MLLD_API_TIMEOUT=5000

# Run tests with coverage
mlld test --env .env.ci
```

## Limitations

The current test system has these limitations:

- **No mocking**: External dependencies must be handled manually
- **Sequential execution**: Tests run one file at a time
- **No setup/teardown**: No built-in before/after hooks
- **Shared environment**: All tests in a file share the same variable scope
- **No test isolation**: Tests can affect each other within the same file

For complex testing needs, consider:
- Splitting tests into multiple files for isolation
- Using separate test data files
- Creating dedicated test modules with helper functions
- Mocking external dependencies with conditional logic
