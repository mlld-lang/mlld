# Wildcard (*) in when conditions

## Basic wildcard usage
/when * => show "Always executes"

## Wildcard in when block array
/when [
  * => show "Default handler"
  false => show "Never shown"
]

## Wildcard with logical operators
/var @condition = true
/when * && @condition => show "Both true"
/when * || false => show "At least one true"
/when !* => show "Never executes"

## Wildcard in ternary
/var @result = * ? "truthy" : "falsy"
/show "Wildcard is: @result"
