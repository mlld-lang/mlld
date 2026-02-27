# Guard Composition - Transform Then Deny

/var secret @word = "clean"

/exe @blocked(value) = when [
  denied => [
    show `replacement: @mx.guard.trace[0].replacement`
    show `reason: @mx.guard.reason`
  ]
  * => show "should not run"
]

/guard @upper for secret = when [
  @mx.op.type == "exe" => allow @input.toUpperCase()
  * => allow
]

/guard @denyAll for secret = when [
  @mx.op.type == "exe" => deny "blocked after transform"
  * => allow
]

/show @blocked(@word)
