/guard @stageRetrySecret for secret = when [
  @ctx.op.type == "pipeline-stage" && @ctx.op.subtype == "sendStage" && @ctx.guard.try == 1 => retry "Retry send stage for masked output"
  @ctx.op.type == "pipeline-stage" && @ctx.op.subtype == "sendStage" => deny "Stage denied secret after retry"
  * => allow
]

/exe network @sendStage(value) = when [
  denied => `blocked: @ctx.guard.reason (tries: @ctx.guard.try)`
  * => `sent:@value`
]

/var secret @token = "  sk-stage-444  "
/var @result = @token.trim().slice(0, 8) with { pipeline: [@sendStage] }
/show `Pipeline retry result: @result`
