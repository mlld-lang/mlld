/exe @is_true() = cmd {echo "true"}
/exe @is_false() = cmd {echo ""}

## Test 1: Inline conditional
/when @is_true() => show "This should appear"
/when @is_false() => show "This should NOT appear"

## Test 2: Match form
/var @mode = "development"

/when @mode : [
  "production" => show "Production mode"
  "development" => show "Development mode"
  true => show "Unknown mode"
]

## Test 3: || operator (replacing any modifier)
/exe @has_node() = cmd {echo "true"}
/exe @has_npm() = cmd {echo "true"}
/exe @has_yarn() = cmd {echo ""}

/when (@has_node() || @has_npm() || @has_yarn()) => show "Package manager found"

## Test 4: when block with individual actions (first match)
/when [
  @has_node() => show "Node.js installed"
  @has_npm() => show "npm installed"
]
