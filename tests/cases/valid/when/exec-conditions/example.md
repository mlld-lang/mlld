@exec is_true() = [(echo "true")]
@exec is_false() = [(echo "false")]

## Test 1: Simple conditional
@when @is_true() => @add "This should appear"
@when @is_false() => @add "This should NOT appear"

## Test 2: Block with first modifier
@exec get_env() = [(echo "development")]
@exec is_dev(env) = [(echo "{{env}}" | grep -q "development" && echo "true")]
@exec is_prod(env) = [(echo "{{env}}" | grep -q "production" && echo "true")]
@exec always_true() = [(echo "true")]

@when @env first: [
  @is_prod(@env) => @add "Production mode"
  @is_dev(@env) => @add "Development mode"
  @always_true() => @add "Unknown mode"
]

## Test 3: any modifier
@exec has_node() = [(command -v node >/dev/null && echo "true")]
@exec has_npm() = [(command -v npm >/dev/null && echo "true")]
@exec has_yarn() = [(command -v yarn >/dev/null && echo "true")]

@when any: [
  @has_node()
  @has_npm()
  @has_yarn()
] => @add "Package manager found"

## Test 4: all modifier
@exec check_file(name) = [(test -f "{{name}}" && echo "{{name}} exists")]

@when all: [
  @has_node() => @add "Node.js installed"
  @has_npm() => @add "npm installed"
]