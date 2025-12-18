/guard before secret = when [
  @mx.op.type == "run" => deny "No shell access"
  * => allow
]