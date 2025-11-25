/guard @fileWritePolicy before secret = when [
  @ctx.op.type == "output" => deny "Cannot write secrets to files"
  * => allow
]

/guard @displayPolicy before secret = when [
  @ctx.op.type == "show" => allow @redact(@input)
  * => allow
]