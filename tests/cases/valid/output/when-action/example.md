# Test Output in When Actions

/text @condition = "yes"
/text @result = "Condition was true!"

/when @condition: [
  "yes" => @output @result [when-output.txt]
  "no" => @output "Condition was false" [false-output.txt]
]

Document continues after conditional outputs.