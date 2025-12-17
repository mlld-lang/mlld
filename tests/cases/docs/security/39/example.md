/guard @secretProtection before secret = when [
  @mx.op.type == "run" => deny "No secrets in shell"
  @mx.op.type == "output" => deny "No secrets to files"
  * => allow
]