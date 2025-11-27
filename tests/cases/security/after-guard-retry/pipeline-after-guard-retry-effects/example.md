# After guard retry in pipeline re-emits effects

/guard after @pipelineRetry for retryable = when [
  @output != "ok" && @ctx.guard.try < 3 => retry "retry stage"
  * => allow
]

/exe @emit(value) = js { return value; }
/exe @flakyStage(value) = js {
  globalThis.__afterEffects = (globalThis.__afterEffects || 0) + 1;
  return globalThis.__afterEffects === 1 ? "bad" : "ok";
}

/var retryable @result = @emit("start") | @flakyStage
/show `result: @result`
