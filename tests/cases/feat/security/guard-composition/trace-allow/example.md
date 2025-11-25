# Guard Composition - Trace On Allow (Pipeline History)

/guard @allowSecret for secret = when [
  * => allow
]

/exe @echo(val) = cmd { @val }

/exe @report(val) = cmd {
  /show `decisions: @p.guards.map(g => g.decision)`
  /show `first-trace: @p.guards[0].trace.length`
  @val
}

/var secret @data = "ok"

/show @data | @echo | @report
