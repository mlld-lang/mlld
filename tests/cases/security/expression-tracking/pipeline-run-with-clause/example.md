/guard for secret = when [
  @mx.op.subtype == "process" => deny "Guard blocked"
  * => allow
]

/exe network @process(value) = when [
  denied => `blocked: @mx.guard.reason`
  * => `sent:@value`
]

/var secret @token = "  sk-run-999  "
/exe @return(value) = js { return value.trim() }
/run @return(@token) with { pipeline: [@process] }
