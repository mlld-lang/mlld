# Variable When Expressions Test

Testing when expressions as values in variable assignments.

## Basic when expression with literal values
/var @greeting = when: [
  1 == 1 => "Hello"
  1 == 2 => "Goodbye"
]

Greeting (should be Hello):
/show @greeting

## When expression with variable condition
/var @condition = true
/var @message = when: [
  @condition => "Condition is true"
  true => "Condition is false"
]

Message:
/show @message

## When expression with null fallback
/var @value = "found"
/var @result = when: [
  @value == "found" => "Value was found"
  @value == "missing" => "Value is missing"
  true => null
]

Result:
/show @result

## Variable conditions
/var @isProduction = true
/var @status = when: [
  @isProduction => "Production mode"
  true => "Development mode"
]

Status:
/show @status
