# When Directive with Literal Condition

The @when directive can accept literal values for simple conditional checks.

## Using literal true
/when true => /show "This always executes"

## Using literal false  
/when false => /show "This never executes"

## Using literal null
/when null => /show "This never executes (null is falsy)"

## Using literal string
/when "value" => /show "Non-empty strings are truthy"

## Using a variable
/var @myCondition = "true"
/when @myCondition => /show "Variables work too"