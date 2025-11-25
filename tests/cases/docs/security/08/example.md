/guard @secretBlock before secret = when [
  @ctx.op.type == "show" => deny "Cannot display secrets"
  * => allow
]

/var secret @key = "sk-12345"

/exe @display(value) = when [
  denied => `[REDACTED] - @ctx.guard.reason`
  * => `Value: @value`
]

/show @display(@key)                       # Shows: [REDACTED] - Cannot display secrets