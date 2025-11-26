/exe @is_true() = cmd {echo "true"}
/exe @is_false() = cmd {echo ""}

## Test 1: Simple conditional
/when @is_true() => show "This should appear"
/when @is_false() => show "This should NOT appear"

## Test 2: Block with first modifier
/var @env = "development"
/exe @is_dev() = cmd {echo "true"}
/exe @is_prod() = cmd {echo ""}

/when @mode first: [
  @is_prod() => show "Production mode"
  @is_dev() => show "Development mode"
  "true" => show "Unknown mode"
]

## Test 3: Using || operator
/exe @has_node() = cmd {echo "true"}
/exe @has_npm() = cmd {echo "true"}
/exe @has_yarn() = cmd {echo ""}

/when (@has_node() || @has_npm() || @has_yarn()) => show "Package manager found"

## Test 4: Bare when evaluates all matching conditions
/when [
  @has_node() => show "Node.js installed"
  @has_npm() => show "npm installed"
]
