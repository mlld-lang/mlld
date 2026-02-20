/exe llm @review(prompt, model) = js {
  globalThis.__fixtureForkOverlayCounter = (globalThis.__fixtureForkOverlayCounter || 0) + 1;
  const rawPrompt = prompt && typeof prompt === "object" && "value" in prompt ? prompt.value : prompt;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "review:" + rawPrompt + ":" + rawModel;
}

/var @first = @review("prompt-a", "sonnet")
/var @extra = @review("prompt-b", "sonnet")

/show @first
/show @extra
