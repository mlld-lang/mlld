/guard @noSecretOutputs before op:output = when [
  @input.ctx.labels.includes("secret") => deny "No secrets in output effects"
  * => allow
]

/var secret @token = "sk-when-123"

/var @result = when [
  true => @token | output to "effect-guard-output-when.txt"
]
