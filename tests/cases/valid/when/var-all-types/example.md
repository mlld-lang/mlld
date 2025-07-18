# Test /when with var assignments of all types

/exe @getObject() = js { return { "status": "ok", "count": 42 }; }
/exe @getArray() = js { return ["one", "two", "three"]; }
/exe @transform(data) = `transformed: @data`

/var @condition1 = "true"
/var @condition2 = "false"
/var @dataType = "object"

# Test string literal assignment
/when @condition1 => var @text = "simple string"
/show `Text: @text`

# Test template assignment
/when @condition1 => var @template = `Hello from template with @text`
/show `Template: @template`

# Test variable reference assignment
/when @condition1 => var @copy = @text
/show `Copy: @copy`

# Test function call assignment
/when @condition1 => var @transformed = @transform(@text)
/show `Transformed: @transformed`

# Test object assignment via function
/when @condition1 => var @objectData = @getObject()
/show `Object status: @objectData.status`
/show `Object count: @objectData.count`

# Test array assignment via function
/when @condition1 => var @arrayData = @getArray()
/show `Array data: @arrayData`

# Test in switch form with mixed types
/when @dataType: [
  "object" => var @result = @getObject()
  "array" => var @result = @getArray()
  "string" => var @result = "fallback"
]
/show `Switch result: @result.status`

# Test command execution assignment
/when @condition1 => var @commandResult = run {echo "Hello from command"}
/show `Command: @commandResult`

# Test nested function calls
/when @condition1 => var @nested = @transform(@transform("data"))
/show `Nested: @nested`