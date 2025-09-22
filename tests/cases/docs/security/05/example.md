>> Dangerous: Direct execution of LLM output
/var @llmResponse = run {llm "@userPrompt"}
/run @llmResponse | { cat } | @processResponse