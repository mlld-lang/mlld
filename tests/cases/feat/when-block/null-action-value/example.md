/var @condition = true

/var @result = when [
  @condition => null
  * => "fallback"
]

/show "Result: @result"
