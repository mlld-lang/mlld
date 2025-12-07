/guard @secretProtection before secret = when [
  @ctx.op.type == "run" => deny "No secrets in shell"
  @ctx.op.type == "output" => deny "No secrets to files"
  * => allow
]