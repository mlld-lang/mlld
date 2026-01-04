# Guard Multiple Handlers

/guard @secretExecBlock for secret = when [
  @mx.op.type == "exe" => deny "Secrets cannot be logged"
  * => allow
]

/var secret @apiKey = "sk-live-789"

/exe @auditSecret(secretValue) = when [
  denied => show "First handler saw: @mx.guard.reason"
  denied => show "Second handler recorded input: @secretValue"
  * => show `Secret: @secretValue`
]

/show @auditSecret(@apiKey)
