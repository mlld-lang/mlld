stream /exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello") with { stream: false } # Buffer, show when complete