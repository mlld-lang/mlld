>> Regression test: Template interpolation in block let statements
>> Bug: Templates like "text @var" passed to functions inside block let statements
>> were not being interpolated - the raw AST was passed instead.

exe @checker(prompt) = js {
  // Return whether the prompt contains the expected interpolated value
  if (prompt.includes("hello world")) return "PASS";
  return "FAIL: got " + JSON.stringify(prompt);
}

>> This pattern was broken before the fix
exe @testDirect(value) = [
  let @result = @checker("Check: @value")
  => @result
]

>> This pattern always worked (intermediate variable)
exe @testIntermediate(value) = [
  let @prompt = "Check: @value"
  let @result = @checker(@prompt)
  => @result
]

show "Direct template in let:"
show @testDirect("hello world")

show "Intermediate variable:"
show @testIntermediate("hello world")
