# Before guard retry on pipeline stage succeeds

/guard @retryBefore before retryable = when [
  @input != "ok" && @ctx.guard.try < 2 => retry "retry before stage"
  @input != "ok" => deny "still bad"
  * => allow
]

/exe retryable @seed() = js { return "seed"; }

/exe @flakyStage(value) = js {
  globalThis.__beforeRetry = (globalThis.__beforeRetry || 0) + 1;
  return globalThis.__beforeRetry === 1 ? "bad" : "ok";
}

/var retryable @value = @seed() with { pipeline: [@flakyStage] }
/show `value: @value`
