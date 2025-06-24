# Test: run with template executables

This test verifies that template executables can be invoked with @run.

## Define executables
/exe @greet(name) = {echo "Hello, @name!"}
/exe @templateGreet(name) = [[Template says: {{name}}!]]
/exe @backtickGreet(name) = `Backtick says: @name!`

## Test run with different exec types

### Command exec (should work)
/run @greet("Alice")

### Template exec (currently fails with "nodes is not iterable")
/run @templateGreet("Bob")

### Backtick template exec
/run @backtickGreet("Carol")