# Guard Composition - Unnamed Guards Deterministic Order

/guard for secret = when [
  * => allow `@input\-1`
]

/guard for secret = when [
  * => allow `@input\-2`
]

/var secret @value = "base"

/show @value
