# Test Output in When Actions

/var @condition = "yes"
/var @result = "Condition was true!"

/when @condition: [
  "yes" => output @result [when-output.txt]
  "no" => output "Condition was false" [false-output.txt]
]

Document continues after conditional outputs.