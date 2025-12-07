/guard @redactSecrets before secret = when [
  @ctx.op.type == "show" => allow @redact(@input)
  * => allow
]