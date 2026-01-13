/var @condition = true

/var @result = when first [
  @condition => null
  * => "fallback"
]

/show "Result: @result"
