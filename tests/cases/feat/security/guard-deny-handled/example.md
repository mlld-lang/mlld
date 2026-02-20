# Guard Deny Handled

/guard @secretExecBlock for secret = when [
  @mx.op.type == "exe" => deny "Secrets cannot be displayed"
  * => allow
]

/var secret @apiKey = "sk-live-123"

/exe @renderSecret(secretValue) = when [
  denied => [
    show "Blocked: @mx.guard.reason"
    show "Input labels: @mx.labels.join(', ')"
  ]
  * => show `Secret is: @secretValue`
]

/show @renderSecret(@apiKey)
