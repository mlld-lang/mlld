/exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello") with { stream: true }  # Streams this call only