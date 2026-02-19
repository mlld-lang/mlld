/exe @markAfter(value) = js {
  globalThis.__fixtureCheckpointGuardAfter = (globalThis.__fixtureCheckpointGuardAfter || 0) + 1;
  return value;
}

/exe llm @review(prompt, model) = js {
  globalThis.__fixtureCheckpointGuardCounter = (globalThis.__fixtureCheckpointGuardCounter || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "review:" + rawPrompt + ":" + rawModel;
}

/guard after @afterReview for op:exe = when [
  @mx.op.name == "review" => allow @markAfter(@output)
  * => allow @output
]

/var @first = @review("src/b.ts", "sonnet")
/var @second = @review("src/b.ts", "sonnet")

/show @first
/show @second
