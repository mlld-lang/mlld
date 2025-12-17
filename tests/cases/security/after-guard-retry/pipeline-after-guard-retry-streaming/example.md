# After guard retry blocked by streaming

/guard after @pipelineRetry for retryable = when [
  @output != "ok" && @mx.guard.try < 3 => retry "retry stage"
  * => allow
]

/exe @flakyStage(value) = js { return value; }

/var retryable @result = "bad" with { pipeline: [@flakyStage], stream: true }
/show `result: @result`
