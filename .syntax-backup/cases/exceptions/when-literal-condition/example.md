# When Directive with Literal Condition

The @when directive requires a variable to evaluate, not a literal value.

## Invalid: Using literal true
@when true => @add "This is invalid syntax"

## Invalid: Using literal false  
@when false => @add "This is also invalid"

## Invalid: Using literal null
@when null => @add "This too is invalid"

## Invalid: Using literal string
@when "value" => @add "String literals are not allowed"

## Valid: Using a variable
@text myCondition = "true"
@when @myCondition => @add "This is valid syntax"