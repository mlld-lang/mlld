/var @env = "production"

# first: modifier - executes only the first matching condition
/when @env first: [
  @env => @show "Env has value"
  "true" => @show "Always true"
  "yes" => @show "Also always true"
]