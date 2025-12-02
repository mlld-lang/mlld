/guard @noSecretAppend before op:append = when [
  @input.ctx.labels.includes("secret") => deny "No secrets in append effects"
  * => allow
]

/var secret @data = "secret-append"

@data | append "effect-guard-append-pipeline.txt"
