/exe @is_true() = {echo "true"}
/exe @is_false() = {echo ""}

## Test 1: Simple conditional
/when @is_true() => @show "This should appear"
/when @is_false() => @show "This should NOT appear"

## Test 2: Block with first modifier
/var @env = "development"
/exe @is_dev() = {echo "true"}
/exe @is_prod() = {echo ""}

/when @mode first: [
  @is_prod() => @show "Production mode"
  @is_dev() => @show "Development mode"
  "true" => @show "Unknown mode"
]

## Test 3: any modifier
/exe @has_node() = {echo "true"}
/exe @has_npm() = {echo "true"}
/exe @has_yarn() = {echo ""}

/when @tools any: [
  @has_node()
  @has_npm()
  @has_yarn()
] => @show "Package manager found"

## Test 4: all modifier
/when @tools all: [
  @has_node() => @show "Node.js installed"
  @has_npm() => @show "npm installed"
]