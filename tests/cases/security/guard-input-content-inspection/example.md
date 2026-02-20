/guard @contentInspection before op:exe = when [
  @mx.op.name == "send" && @input.any.text && @input.any.text.includes("<script") => allow "[SCRIPT]"
  @mx.op.name == "send" && @input.any.text && @input.any.text.includes("sk-") => allow "[KEY]"
  * => allow
]

/exe @send(value) = `send:@value`

/show @send("<script>alert('xss')</script>")
/show @send("sk-live-123")
/show @send("hello")
