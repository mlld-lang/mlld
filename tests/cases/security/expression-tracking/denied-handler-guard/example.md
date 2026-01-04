/guard @sendSecretBlock for secret = when [
  @mx.op.type == "exe" && @mx.op.name == "sendData" => deny "Network secret blocked"
  * => allow
]

/guard @handlerDisplayBlock for secret = when [
  @mx.op.name == "displayDenied" => deny "Handler display blocked"
  * => allow
]

/exe network @sendData(value) = when [
  denied => @displayDenied(@value)
  * => `sent:@value`
]

/exe @displayDenied(value) = when [
  denied => `blocked display: @mx.guard.reason`
  * => `displayed: @value`
]

/var secret @token = "  sk-handler-111  "
/show @sendData(@token.trim())
