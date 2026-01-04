/guard for secret = when [
  @mx.op.subtype == "process" => deny "No secrets over network"
  * => allow
]

/exe @transform(value) = `transform:@value`
/exe network @process(value) = when [
  denied => `blocked: @mx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-123  "
/var @result = @token.trim().slice(0, 6) | @transform | @process
/show @result
