/guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]