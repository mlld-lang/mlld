# Guard Composition - Registration Order

/guard @first for op:exe = when [
  * => allow
]

/guard @second for op:exe = when [
  * => allow
]

/exe @foo() = cmd {
  "x"
}

/exe @report(val) = cmd {
  /show `order: @p.guards.filter(g => g.operation?.name == "foo").map(g => g.trace[0].guardName)`
  @val
}

/show @foo() | @report
