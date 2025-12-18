# After guard retry pipeline success

/guard after @pipelineRetry for retryable = when [
  @output != "ok" && @mx.guard.try < 3 => retry "need ok from pipeline"
  @output != "ok" => deny "still invalid"
  * => allow
]

/exe @flakyStage(value) = js {
  globalThis.__pipelineAfterFlaky = (globalThis.__pipelineAfterFlaky || 0) + 1;
  return globalThis.__pipelineAfterFlaky === 1 ? "bad" : "ok";
}

/var retryable @pipelineValue = "seed" with { pipeline: [@flakyStage] }
/show `pipeline value: @pipelineValue`
