/exe @redact(text) = js { return text.slice(0, 4) + '****'; }

/guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]

/var secret @key = "sk-12345678"
/show @key                                 # Output: sk-1****