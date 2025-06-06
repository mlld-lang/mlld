# Test Output in When Actions

@text condition = "yes"
@text result = "Condition was true!"

@when @condition: [
  @equals("yes") => @output @result [when-output.txt]
  @equals("no") => @output "Condition was false" [false-output.txt]
]

@data values = ["apple", "banana", "cherry"]

@when @values: [
  @contains("apple") => @output "Found apple!" [found-apple.txt]
]

Document continues after conditional outputs.