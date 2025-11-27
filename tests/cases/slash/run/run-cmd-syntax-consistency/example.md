# Test run cmd syntax in var and exe contexts

Both `run {...}` and `run cmd {...}` should work consistently.

## In /var assignments

/var @implicit = run {echo "implicit cmd"}
/var @explicit = run cmd {echo "explicit cmd"}

## In /exe definitions

/exe @implicitFunc() = run {echo "implicit in exe"}
/exe @explicitFunc() = run cmd {echo "explicit in exe"}

## With stdin patterns

/var @data = "test"
/exe @withStdin(input) = run cmd { cat } with { stdin: @input }
/exe @pipeStdin(input) = run @input | { cat }

## Show results

/show @implicit
/show @explicit
/show @implicitFunc()
/show @explicitFunc()
/show @withStdin(@data)
/show @pipeStdin(@data)
