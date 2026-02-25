# Guard Composition - Registration Order

/var secret @data = "x"

/exe @foo(val) = @val

/exe @report(val) = `order: @p.guards[0].trace[0].guardName,@p.guards[0].trace[1].guardName
@val`

/guard @first for secret = when [
  @mx.op.type == "exe" => allow
  * => allow
]

/guard @second for secret = when [
  @mx.op.type == "exe" => allow
  * => allow
]

/show @data | @foo | @report
