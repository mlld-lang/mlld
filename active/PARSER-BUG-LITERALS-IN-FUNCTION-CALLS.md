# Parser Bug: Cannot use array/object literals in function calls

## Description

The mlld parser fails to parse array and object literals when they are used as arguments in function calls. This is a parser bug that produces an extremely unhelpful error message.

## Current Behavior

When trying to use array or object literals in function calls, the parser fails with:
```
Parse error: Syntax error: Expected a directive or content, but found "/" at line X, column 1
```

This error message is misleading because:
1. It points to the `/` at the start of the line (which is correct for directives)
2. It says it expected "var directive" among other things, when the line IS a var directive
3. The actual problem is somewhere inside the line, not at the start

## Expected Behavior

The following should parse and work correctly:
```mlld
/import { deepEq } from @mlld/test
/var @result = @deepEq(["a", "b"], ["a", "b"])  // Should work!
/var @config = @merge({"a": 1}, {"b": 2})       // Should work!
```

## Reproduction

### What works:
```mlld
/exe @identity(x) = js { return x; }
/var @result = @identity(42)           // ✓ Works - number literal
/var @result = @identity("hello")      // ✓ Works - string literal

/var @arr = ["a", "b"]
/var @result = @identity(@arr)         // ✓ Works - variable reference
```

### What fails:
```mlld
/exe @identity(x) = js { return x; }
/var @result = @identity(["a", "b"])   // ✗ Fails - array literal
/var @result = @identity({"a": 1})     // ✗ Fails - object literal
```

## Impact

This bug is particularly problematic for test files where you want to write concise assertions:
```mlld
/import { deepEq, ok } from @mlld/test

// Current workaround is verbose:
/var @expected = ["hello", "world", "test"]
/var @actual = @split("hello world test", " ")
/var @test_split = @deepEq(@actual, @expected)

// Should be able to write:
/var @test_split = @deepEq(@split("hello world test", " "), ["hello", "world", "test"])
```

## Technical Details

The parser seems to fail when it encounters `[` or `{` characters inside the parentheses of a function call. This suggests the grammar might not be properly handling nested structures within function arguments.

## Test Cases

These should all parse successfully:
```mlld
// Single argument
@func([1, 2, 3])
@func({"key": "value"})

// Multiple arguments  
@func(["a"], ["b"])
@func({"a": 1}, {"b": 2})

// Nested structures
@func([{"a": 1}, {"b": 2}])
@func({"arr": [1, 2, 3]})

// Mixed with other types
@func("prefix", ["a", "b"], "suffix")
@func(42, {"config": true}, @variable)
```

## Priority

High - This is a basic language feature that should work, and the current error message is actively misleading developers.