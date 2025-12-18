/guard @noSecretOutputs before op:output = when [
  @input.mx.labels.includes("secret") => deny "No secrets in output effects"
  * => allow
]

/var secret @key = "sk-secret-123"

@key | output to "effect-guard-output-pipeline.txt"
