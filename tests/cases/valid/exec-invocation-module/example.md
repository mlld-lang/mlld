# Test exec invocation from module imports

/import { sayHello, greetUser, multiLine, withParams, greeting } from "./test-module.mld"

## Direct invocation
/run @sayHello()

## With parameter
/run @greetUser("Alice")

## Multi-line command
/run @multiLine()

## Multiple parameters
/run @withParams("foo", "bar")

## In data directive
/var @result = @sayHello()
/show @result

## In text template
/var @message = :::Output: {{greeting}}:::
/show @message

## Verify regular variable import works
/show @greeting