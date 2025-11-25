/guard @noShellSecrets before secret = when [
  @ctx.op.type == "run" => deny "Secrets cannot appear in shell"
  * => allow
]

/var secret @key = "sk-12345"
/run { echo @key }                         # Blocked