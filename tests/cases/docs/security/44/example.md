/guard @blockSecretsInRun before op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Shell cannot access secrets"
  @input.all.mx.tokest < 1000 => allow
  @input.none.mx.labels.includes("pii") => allow
  * => deny "Input validation failed"
]