/exec @is_true() = {echo "true"}
/exec @is_false() = {echo ""}

## Test 1: Simple conditional
/when @is_true() => @add "This should appear"
/when @is_false() => @add "This should NOT appear"

## Test 2: Block with first modifier
/text @env = "development"
/exec @is_dev() = {echo "true"}
/exec @is_prod() = {echo ""}

/when @mode first: [
  @is_prod() => @add "Production mode"
  @is_dev() => @add "Development mode"
  "true" => @add "Unknown mode"
]

## Test 3: any modifier
/exec @has_node() = {echo "true"}
/exec @has_npm() = {echo "true"}
/exec @has_yarn() = {echo ""}

/when @tools any: [
  @has_node()
  @has_npm()
  @has_yarn()
] => @add "Package manager found"

## Test 4: all modifier
/when @tools all: [
  @has_node() => @add "Node.js installed"
  @has_npm() => @add "npm installed"
]