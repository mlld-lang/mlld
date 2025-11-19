/guard for secret = when [
  @ctx.op.name == "process" => deny "Guard blocked"
  * => allow
]

/exe network @process(value) = when [
  denied => `blocked: @ctx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-98765  "
/var @helper = @token.trim().slice(0, 8)

/show `condensed: {{ @helper | @process }}`

/var @tailPipeline = @token.trim() with { pipeline: [@process] }
/show @tailPipeline

/var @explicit = ::{{ @helper }}:: with { pipeline: [@process] }
/show @explicit
