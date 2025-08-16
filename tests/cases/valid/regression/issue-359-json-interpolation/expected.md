# Issue 359: JSON Interpolation in Shell Commands

This test ensures that objects and arrays are properly JSON stringified when interpolated into shell commands, not converted to `[object Object]`.

Test 1 Object: {"name":"Alice","age":30}

Test 2 Array: {"name":"Alice","age":30} {"name":"Bob","age":25}

Test 3 Nested: [1,2] [3,4]

Test 4 Mixed: text 42 true null {"key":"value"}

Test 5 Strings: hello world

Test 6 Numbers: 1 2 3

Test 7 Complex: {"users":[{"id":1},{"id":2}]}