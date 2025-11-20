# Guard Composition - Registration Order

/guard for secret = when [
  * => allow `@input-a`
]

/guard for secret = when [
  * => allow `@input-b`
]

/var secret @value = "seed"

/show @value
