/guard for secret = when [
  @ctx.op.subtype == "process" => deny "Guard blocked"
  * => allow
]

/exe network @process(value) = when [
  denied => `blocked: @ctx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-run-999  "
/exe @return(value) = js { return value.trim() }
/run @return(@token) with { pipeline: [@process] }
