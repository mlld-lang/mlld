# When Directive with Literal Condition

The @when directive requires a variable to evaluate, not a literal value.

## Invalid: Using literal true
/when true => @show "This is invalid syntax"

## Invalid: Using literal false  
/when false => @show "This is also invalid"

## Invalid: Using literal null
/when null => @show "This too is invalid"

## Invalid: Using literal string
/when "value" => @show "String literals are not allowed"

## Valid: Using a variable
/var @myCondition = "true"
/when @myCondition => @show "This is valid syntax"