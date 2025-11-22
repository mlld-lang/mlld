# Guard Composition - Transform Chain

/guard @trim for secret = when [
  * => allow @input.trim()
]

/guard @wrap for secret = when [
  * => allow `safe:@input`
]

/var secret @raw = "  hello  "

/exe @deliver(value) = cmd {
  /show `final: @value`
}

/show @deliver(@raw)
