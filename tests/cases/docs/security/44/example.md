/guard before secret = when [
  @ctx.op.type == "run" => deny "No shell access"
  * => allow
]