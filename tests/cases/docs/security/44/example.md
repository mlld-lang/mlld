/guard @blockSecretsInRun before op:run = when [
  @input.any.ctx.labels.includes("secret") => deny "Shell cannot access secrets"
  @input.all.ctx.tokest < 1000 => allow
  @input.none.ctx.labels.includes("pii") => allow
  * => deny "Input validation failed"
]