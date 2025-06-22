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
/data @result = @sayHello()
/add @result

## In text template
/text @message = [[Output: {{greeting}}]]
/add @message

## Verify regular variable import works
/add @greeting