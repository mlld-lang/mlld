/guard @secretSendPolicy for secret = when [
  @mx.op.name == "sendRaw" => deny "Raw secret blocked"
  @mx.op.name == "sendMasked" => allow
  * => allow
]

/exe network @sendRaw(value) = when [
  denied => show `raw denied: @mx.guard.reason`
  * => `sent:@value`
]

/exe network @sendMasked(value) = when [
  * => show `masked send: @value`
]

/var secret @token = "  sk-sanitize-222  "
/show @sendRaw(@token.trim())
/show @sendMasked(@token.trim().slice(0, 4))
