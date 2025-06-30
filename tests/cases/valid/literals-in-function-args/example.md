# Array and Object Literals in Function Arguments

This test verifies that array and object literals can be passed directly as function arguments.

>> Define test functions
/exe @deepEq(@a, @b) = js {return JSON.stringify(a) === JSON.stringify(b) ? "PASS" : "FAIL"}
/exe @grab(@path, @pattern, @options) = js {return `path: ${path}, pattern: ${pattern}, options: ${JSON.stringify(options)}`}
/exe @filter(@arr, @key, @val) = js {return `Filtering ${arr.length} items by ${key}=${val}`}

>> Test array literals in function calls
/var @array = ["a", "b", "c"]

>> This should work: array literal as argument
/var @result1 = @deepEq(@array, ["a", "b", "c"])
/show `Array literal test: @result1`

>> Test object literals in function calls
/var @result2 = @grab("/path", "*.md", {"includeContent": true})
/show `Object literal test: @result2`

>> Test empty arrays
/var @result3 = @filter([], "key", "value")
/show `Empty array test: @result3`

>> Test nested structures
/var @result4 = @deepEq([{"a": 1}, {"b": 2}], [{"a": 1}, {"b": 2}])
/show `Nested structure test: @result4`

>> Mixed literals
/var @result5 = @grab("/test", "*.js", {"depth": 2, "exclude": [".git", "node_modules"]})
/show `Mixed literals test: @result5`

/show `All literal tests completed!`