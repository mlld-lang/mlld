/guard @manualRetryPolicy for secret = when [
  @ctx.op.name == "sendRetryStage" && !@input.startsWith("safe:") => deny "Needs masking"
  * => allow
]

/exe network @sendRetryStage(value) = when [
  denied => show `denied try: @ctx.guard.reason (input: @value)`
  denied => @sendRetryStage(`safe:${value.slice(0, 4)}`)
  * => `final send: @value`
]

/var secret @token = "  sk-manual-444  "
/var @result = @token.trim() with { pipeline: [@sendRetryStage] }
/show @result
