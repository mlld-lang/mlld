@text configKey = "ANTHROPIC_API_KEY"

@when @configKey: [
  "ANTHROPIC_API_KEY" => @add "✓ API key configured"
  "" => @add "ERROR: Missing API key"
]