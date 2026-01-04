/guard @stageRetrySecret for secret = when [
  @mx.op.type == "pipeline-stage" && @mx.op.subtype == "sendStage" && @mx.guard.try == 1 => retry "Retry send stage for masked output"
  @mx.op.type == "pipeline-stage" && @mx.op.subtype == "sendStage" => deny "Stage denied secret after retry"
  * => allow
]

/exe network @sendStage(value) = when [
  denied => `blocked: @mx.guard.reason (tries: @mx.guard.try)`
  * => `sent:@value`
]

/var secret @token = "  sk-stage-444  "
/var @result = @token.trim().slice(0, 8) with { pipeline: [@sendStage] }
/show `Pipeline retry result: @result`
