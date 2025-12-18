# After guard retry non-pipeline success

/guard after @retryFlaky for retryable = when [
  @output != "ok" && @mx.guard.try < 3 => retry "need ok"
  @output != "ok" => deny "still bad"
  * => allow
]

/exe @flaky() = js {
  globalThis.__afterFlaky = (globalThis.__afterFlaky || 0) + 1;
  return globalThis.__afterFlaky === 1 ? "bad" : "ok";
}

/var retryable @value = @flaky()
/show `value: @value`
