# Issue 359: JSON Interpolation in Shell Commands

This test ensures that objects and arrays are properly JSON stringified when interpolated into shell commands, not converted to `[object Object]`.

/var @obj = {"name": "Alice", "age": 30}
/var @data = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/var @nested = [[1, 2], [3, 4]]
/var @mixed = ["text", 42, true, null, {"key": "value"}]
/var @strings = ["hello", "world"]
/var @numbers = [1, 2, 3]
/var @complex = {"users": [{"id": 1}, {"id": 2}]}

/run {echo "Test 1 Object: @obj"}
/run {echo "Test 2 Array: @data"}
/run {echo "Test 3 Nested: @nested"}
/run {echo "Test 4 Mixed: @mixed"}
/run {echo "Test 5 Strings: @strings"}
/run {echo "Test 6 Numbers: @numbers"}
/run {echo "Test 7 Complex: @complex"}