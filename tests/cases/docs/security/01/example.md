/var secret @apiKey = "sk-live-12345"

/guard @noShellSecrets before secret = when [
  @ctx.op.type == "run" => deny "Secrets cannot appear in shell commands"
  * => allow
]

/run { echo @apiKey }  # Blocked by guard