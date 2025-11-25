/guard for secret = when [
  @ctx.op.subtype == "process" => deny "Guard blocked"
  * => allow
]

/exe network @process(value) = when [
  denied => `blocked: @ctx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-98765  "
/var @helper = @token.trim().slice(0, 8)
/var @condensedResult = @helper | @process
/show `condensed: @condensedResult`

/var @tailPipeline = @token.trim() with { pipeline: [@process] }
/show `explicit: @tailPipeline`

/show "show pipeline:"
/show @helper with { pipeline: [@process] }
