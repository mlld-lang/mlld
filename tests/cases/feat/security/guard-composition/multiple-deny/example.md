# Guard Composition - Multiple Deny Reasons

/guard @gd1 for secret = when [
  * => deny "first deny"
]

/guard @gd2 for secret = when [
  * => deny "second deny"
]

/var secret @payload = "hidden"

/exe @useSecret(value) = when [
  denied => show `reasons: @ctx.guard.reasons`
  denied => show `trace-count: @ctx.guard.trace.length`
  * => show "allowed"
]

/show @useSecret(@payload)
