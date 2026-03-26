/exe llm @emit(prompt) = js {
  globalThis.__fixtureHookObservabilityCounter = (globalThis.__fixtureHookObservabilityCounter || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  return "emit:" + rawPrompt;
}

/hook @stateTelemetry after op:named:emit = [
  output `telemetry:@mx.op.name:@mx.checkpoint.hit` to "state://telemetry"
]

/hook @appendLog after op:named:emit = [
  append `append:@mx.op.name` to "hooks-observability.log"
]

/hook @externalAttempt after op:named:emit = [
  run node { process.exit(0) }
]

/hook @appendFailure after op:named:emit = [
  append "not-json" to "hooks-observability.jsonl"
]

/hook @captureErrors after op:named:emit = [
  append `errors:@mx.hooks.errors.length` to "hooks-observability.log"
]

/var @out = @emit("alpha")
/show @out
