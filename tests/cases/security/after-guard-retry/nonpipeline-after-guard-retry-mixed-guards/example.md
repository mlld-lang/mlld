# After guard retry with mixed guards (retry then deny)

/guard after @retryThenDeny for retryable = when [
  @output != "ok" && @ctx.guard.try < 2 => retry "retry first"
  @output != "ok" => deny "deny second"
  * => allow
]

/guard after @noopAllow for retryable = when [
  * => allow
]

/exe @flaky() = js {
  globalThis.__afterMixed = (globalThis.__afterMixed || 0) + 1;
  return globalThis.__afterMixed === 1 ? "bad" : "still-bad";
}

/var retryable @value = @flaky()
/show `value: @value`
