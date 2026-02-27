# Guard Composition - Transform Chain

/var secret @raw = "  hello  "

/exe @deliver(value) = `final: @value`

/guard @trim for secret = when [
  * => allow @input.trim()
]

/guard @wrap for secret = when [
  * => allow `safe:@input`
]

/show @deliver(@raw)
