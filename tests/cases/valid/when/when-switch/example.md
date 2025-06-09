@exec hasEnvVar(name) = @run [test -n "${!{{name}}}"]

@when @hasEnvVar("ANTHROPIC_API_KEY"): [
  true => @add "✓ API key configured"
  false => @output "ERROR: Missing ANTHROPIC_API_KEY" [stderr]
]