/guard @fileWritePolicy before secret = when [
  @mx.op.type == "output" => deny "Cannot write secrets to files"
  * => allow
]

/guard @displayPolicy before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]