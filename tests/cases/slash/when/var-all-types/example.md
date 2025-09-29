# Test /when with var assignments of all types

/exe @getObject() = js { return { "status": "ok", "count": 42 }; }
/exe @getArray() = js { return ["one", "two", "three"]; }
/exe @transform(data) = `transformed: @data`

/var @condition1 = "true"
/var @condition2 = "false"
/var @dataType = "object"

# Test string literal assignment (implicit /var)
/when @condition1 => @text = "simple string"
/show `Text: @text`

# Test template assignment
/when @condition1 => @template = `Hello from template with @text`
/show `Template: @template`

# Test variable reference assignment
/when @condition1 => @copy = @text
/show `Copy: @copy`

# Test function call assignment
/when @condition1 => @transformed = @transform(@text)
/show `Transformed: @transformed`

# Test object assignment via function
/when @condition1 => @objectData = @getObject()
/show `Object status: @objectData.status`
/show `Object count: @objectData.count`

# Test array assignment via function
/when @condition1 => @arrayData = @getArray()
/show `Array data: @arrayData`

# Test in when first with mixed types
/when first [
  @dataType == "object" => @result = @getObject()
  @dataType == "array" => @result = @getArray()
  * => @result = "fallback"
]
/show `Switch result: @result.status`

# Test command execution assignment
/when @condition1 => @commandResult = run {echo "Hello from command"}
/show `Command: @commandResult`

# Test nested function calls
/when @condition1 => @nested = @transform(@transform("data"))
/show `Nested: @nested`