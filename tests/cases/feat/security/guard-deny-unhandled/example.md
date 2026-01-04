# Guard Deny Unhandled

/guard @secretExecBlock for secret = when [
  @mx.op.type == "exe" => deny "Secrets blocked in exec"
  * => allow
]

/var secret @apiKey = "sk-live-456"

/exe @processSecret(secretValue) = when [
  * => show `Secret is: @secretValue`
]

/show @processSecret(@apiKey)
