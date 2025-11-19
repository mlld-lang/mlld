/guard for secret = when [
  @ctx.op.subtype == "process" => deny "No secrets over network"
  * => allow
]

/exe @transform(value) = `transform:@value`
/exe network @process(value) = when [
  denied => `blocked: @ctx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-123  "
/var @result = @token.trim().slice(0, 6) | @transform | @process
/show @result
