stream /exe @llm(prompt) = run { claude "@prompt" --output-format stream-json }

/run stream @llm("Hello") with { streamFormat: "claude-code" }