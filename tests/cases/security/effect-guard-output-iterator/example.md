/guard @noSecretOutputs before op:output = when [
  @input.mx.labels.includes("secret") => deny "No secrets in output effects"
  * => allow
]

/var secret @token = "sk-loop-123"

/for @value in [@token] => @value | output to "effect-guard-output-iterator.txt"
