# Guard Multiple Handlers

/guard @secretExecBlock for secret = when [
  @ctx.op.type == "exec-invocation" => deny "Secrets cannot be logged"
  * => allow
]

/var secret @apiKey = "sk-live-789"

/exe @auditSecret(secretValue) = when [
  denied => show "First handler saw: @ctx.guard.reason"
  denied => show "Second handler recorded input: @input"
  * => show `Secret: @secretValue`
]

/show @auditSecret(@apiKey)
