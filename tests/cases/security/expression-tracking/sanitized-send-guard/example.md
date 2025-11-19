/guard @secretSendPolicy for secret = when [
  @ctx.op.name == "sendRaw" => deny "Raw secret blocked"
  @ctx.op.name == "sendMasked" => allow
  * => allow
]

/exe network @sendRaw(value) = when [
  denied => show `raw denied: @ctx.guard.reason`
  * => `sent:@value`
]

/exe network @sendMasked(value) = when [
  * => show `masked send: @value`
]

/var secret @token = "  sk-sanitize-222  "
/show @sendRaw(@token.trim())
/show @sendMasked(@token.trim().slice(0, 4))
