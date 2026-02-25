# Guard Composition - Multiple Deny Reasons

/var secret @payload = "hidden"

/exe @useSecret(value) = when [
  denied => [
    show `reasons: @mx.guard.reasons`
    show `trace-count: @mx.guard.trace.length`
  ]
  * => show "allowed"
]

/guard @gd1 for secret = when [
  @mx.op.type == "exe" => deny "first deny"
  * => allow
]

/guard @gd2 for secret = when [
  @mx.op.type == "exe" => deny "second deny"
  * => allow
]

/show @useSecret(@payload)
