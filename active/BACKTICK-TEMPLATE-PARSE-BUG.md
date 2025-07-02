# Grammar Bug: Parse Error with Backtick Templates in Function Calls

## Summary
The parser fails when a backtick template is used as the first argument to a function call in a variable assignment, producing an unhelpful error message that points to the wrong location.

## Bug Description
When using a backtick template as the first argument to a function like `@eq()`, the parser throws a confusing error:
```
Parse error: Syntax error: Expected a directive or content, but found "/" at line X, column 1
```

The error points to the `/var` directive itself, making it appear as if `/var` is not recognized, when the actual issue is with parsing the backtick template within the function call.

## Reproduction Steps

### Minimal Test Case
```mld
/import { eq } from @local/test

/var @hello = "Hello"
/var @world = "World"
/var @combined = "Hello World"
/var @string_concat = @eq(`@hello @world`, @combined)  // ❌ Parse error here
```

### Working Alternative
```mld
/import { eq } from @local/test

/var @hello = "Hello"
/var @world = "World"
/var @combined = "Hello World"
/var @string_concat = @eq("Hello World", @combined)  // ✅ Works fine
```

## Actual vs Expected Behavior

**Actual**: Parser fails with "Expected a directive or content, but found '/'" pointing to the `/var` line

**Expected**: Either:
1. The backtick template should parse correctly within the function call
2. If there's a syntax issue, the error should point to the actual problem (the backtick template) with a helpful message

## Impact
This bug affects all test files in the mlld modules repository that use backtick templates for string interpolation in test assertions. Multiple test files are currently failing with this confusing error:
- `llm/tests/string.test.mld` (line 20)
- `llm/tests/simple-tests.test.mld` (line 9)
- `llm/tests/log.test.mld` (line 42)
- `llm/tests/http.test.mld` (line 8)

## Additional Context
The error only occurs when:
1. A backtick template is used as an argument to a function call
2. The function call is part of a `/var` assignment
3. The backtick template contains variable interpolation (e.g., `@hello`)

The grammar appears to have difficulty parsing the nested context of:
- Variable assignment (`/var @name =`)
- Function call (`@eq(...)`)
- Backtick template with interpolation (`` `@hello @world` ``)

## Workarounds
1. Use string literals instead of backtick templates
2. Store the backtick template result in a variable first:
   ```mld
   /var @temp = `@hello @world`
   /var @test = @eq(@temp, @combined)
   ```

## Environment
- mlld version: 2.0.0-rc
- Discovered while running tests in the mlld modules repository