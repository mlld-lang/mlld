# Guard Deny Handled

/guard @secretExecBlock for secret = when [
  @ctx.op.type == "exec-invocation" => deny "Secrets cannot be displayed"
  * => allow
]

/var secret @apiKey = "sk-live-123"

/exe @renderSecret(secretValue) = when [
  denied => show "Blocked: @ctx.guard.reason"
  denied => show "Input labels: @ctx.labels.join(', ')"
  * => show `Secret is: @secretValue`
]

/show @renderSecret(@apiKey)
