/exe @redact(text) = js { return text.replace(/./g, '*'); }

/guard @redactSecrets before secret = when [
  @mx.op.type == "show" => allow @redact(@input)
  * => allow
]

/var secret @key = "sk-12345"
/show @key                                 # Output: *********