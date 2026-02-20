# Bare When Expression - Executes First Match

Default when stops at first match.

## Use if blocks to run multiple matching actions
/exe @collectAll(value) = [
  if @value > 0 [
    show "positive"
  ]
  if @value > 0 [
    show "greater than zero"
  ]
  if @value > 0 [
    => "final value"
  ]
]

/var @result = @collectAll(5)
/show "Result: @result"

## Default when stops at first match
/exe @stopAtFirst(value) = when [
  @value > 0 => show "positive"
  @value > 0 => show "greater than zero"
  @value > 0 => "final value"
]

/var @firstResult = @stopAtFirst(5)
/show "First result: @firstResult"

## Multiple different conditions can match (first match wins)
/exe @multiMatch(value) = [
  if @value > 3 [
    show "greater than 3"
  ]
  if @value > 5 [
    show "greater than 5"
  ]
  if @value > 7 [
    show "greater than 7"
  ]
  if @value == 6 [
    show "exactly 6"
  ]
  if true [
    => "always matches"
  ]
]

Testing with value 6:
/var @six = @multiMatch(6)
/show "Final: @six"

Testing with value 8:
/var @eight = @multiMatch(8)
/show "Final: @eight"
