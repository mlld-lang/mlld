# Bare When Expression - Evaluates All Matches

Testing that bare `when` (without `first`) evaluates ALL matching conditions.

## Bare when evaluates all conditions
/exe @collectAll(value) = when [
  @value > 0 => show "positive"
  @value > 0 => show "greater than zero"
  @value > 0 => "final value"
]

/var @result = @collectAll(5)
/show "Result: @result"

## Contrast with when first
/exe @stopAtFirst(value) = when first [
  @value > 0 => show "positive"
  @value > 0 => show "greater than zero"
  @value > 0 => "final value"
]

/var @firstResult = @stopAtFirst(5)
/show "First result: @firstResult"

## Multiple different conditions can match
/exe @multiMatch(value) = when [
  @value > 3 => show "greater than 3"
  @value > 5 => show "greater than 5"
  @value > 7 => show "greater than 7"
  @value == 6 => show "exactly 6"
  * => "always matches"
]

Testing with value 6:
/var @six = @multiMatch(6)
/show "Final: @six"

Testing with value 8:
/var @eight = @multiMatch(8)
/show "Final: @eight"