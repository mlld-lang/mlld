# Guard Composition - Unnamed Guards Deterministic Order

/var secret @value = "base"

/guard for secret = when [
  * => allow `@input\-1`
]

/guard for secret = when [
  * => allow `@input\-2`
]

/show @value
