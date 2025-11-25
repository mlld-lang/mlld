# guards/secrets.mld
/guard @secretProtection before secret = when [
  @ctx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

/export guard @secretProtection