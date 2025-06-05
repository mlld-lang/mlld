@text env = "production"

# first: modifier - executes only the first matching condition
@when @env first: [
  @env => @add "Env has value"
  "true" => @add "Always true"
  "yes" => @add "Also always true"
]