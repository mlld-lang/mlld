# Before guard retry on pipeline stage succeeds

/guard @retryBefore before retryable = when [
  @input != "ok" && @mx.guard.try < 2 => retry "retry before stage"
  @input != "ok" => deny "still bad"
  * => allow
]

/exe retryable @seed() = js {
  globalThis.__beforeSeed = (globalThis.__beforeSeed || 0) + 1;
  return globalThis.__beforeSeed === 1 ? "bad" : "ok";
}

/exe @flakyStage(value) = js { return value; }

/var retryable @value = @seed() with { pipeline: [@flakyStage] }
/show `value: @value`
