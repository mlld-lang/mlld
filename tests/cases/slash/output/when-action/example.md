# Test Output in When Actions

/var @condition = "yes"
/var @result = "Condition was true!"

/when @condition: [
  "yes" => output @result to "when-output.txt"
  "no" => output "Condition was false" to "false-output.txt"
]

Document continues after conditional outputs.
