/exe @first() = `first-ok`

/show @first()
/show @mx.tools.calls | @json

/guard @requireFirst before op:exe = when [
  @mx.op.name == "second" && @mx.tools.calls.includes("first") => allow
  @mx.op.name == "second" => deny "Missing first call"
  * => allow
]

/exe @second() = `second-ok`
/show @second()
