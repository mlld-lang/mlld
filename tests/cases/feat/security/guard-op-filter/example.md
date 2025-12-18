# Guard Operation Filter

/guard @shellSecretBlock for op:run = when [
  @input.any.mx.labels.includes("secret") => deny "Shell cannot print secrets"
  * => allow
]

/var secret @apiKey = "sk-secret-123"
/var @publicInfo = "safe"

/run { echo @apiKey @publicInfo }
