# guards/secrets.mld
/guard @secretProtection before secret = when [
  @mx.op.type == "run" => deny "Secrets blocked from shell"
  * => allow
]

/export { @secretProtection }