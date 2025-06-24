/var @configKey = "ANTHROPIC_API_KEY"

/when @configKey: [
  "ANTHROPIC_API_KEY" => @show "✓ API key configured"
  "" => @show "ERROR: Missing API key"
]