# Guard Composition - Transform Then Deny

/guard @upper for secret = when [
  * => allow @input.toUpperCase()
]

/guard @denyAll for secret = when [
  * => deny "blocked after transform"
]

/var secret @word = "clean"

/exe @blocked(value) = when [
  denied => show `replacement: @ctx.guard.trace[0].replacement.value`
  denied => show `reason: @ctx.guard.reason`
  * => show "should not run"
]

/show @blocked(@word)
