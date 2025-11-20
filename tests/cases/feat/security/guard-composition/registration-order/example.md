# Guard Composition - Registration Order

/guard @first for op:exe = when [
  * => allow
]

/guard @second for op:exe = when [
  * => allow
]

/exe @foo() = {
  "x"
}

/exe @report(val) = {
  /show `order: @p.guards.filter(g => g.operation?.name == "foo").map(g => g.trace[0].guardName)`
  @val
}

/show @foo() | @report
