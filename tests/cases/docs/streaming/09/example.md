stream /exe @chat(prompt) = run { claude "@prompt" --output-format stream-json }

# Default parsing (generic NDJSON)
/show @chat("Hello")

# Claude-specific parsing (better for thinking blocks, tool use)
/run stream @chat("Use a tool") with { streamFormat: "claude-code" }