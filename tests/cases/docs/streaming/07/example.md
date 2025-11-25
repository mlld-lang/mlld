stream /exe @llm(prompt) = run {
  claude "@prompt" --output-format stream-json
}

/show @llm("Write a haiku")
# Parses NDJSON, shows message text as it streams