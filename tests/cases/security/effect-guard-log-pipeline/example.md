/guard @noSecretLog before op:log = when [
  @input.mx.labels.includes("secret") => deny "No secrets in log effects"
  * => allow
]

/var secret @token = "secret-log"

@token | log
