/exe llm @review(prompt, model) = js {
  globalThis.__fixtureHooksCheckpointCounter = (globalThis.__fixtureHooksCheckpointCounter || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "review:" + rawPrompt + ":" + rawModel;
}

/hook @trace after @review = [
  append `hook|hit=@mx.checkpoint.hit|fn=@mx.op.name` to "hooks-checkpoint.log"
]

/var @first = @review("src/a.ts", "sonnet")
/var @second = @review("src/a.ts", "sonnet")

/show @first
/show @second
