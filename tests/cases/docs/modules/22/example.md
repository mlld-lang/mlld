---
name: prompts
about: Reusable prompts
---

/exe @systemPrompt(role) = `You are a @role assistant.`
/exe @userPrompt(task) = `Please help me with: @task`
/export { @systemPrompt, @userPrompt }