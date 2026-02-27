# Guard Composition - Trace On Allow (Pipeline History)

/var secret @data = "ok"

/exe @echo(val) = @val

/exe @report(val) = `decisions: @p.guards[0].decision,@p.guards[1].decision
first-trace: @p.guards[0].trace.length`

/guard @allowSecret for secret = when [
  * => allow
]

/show @data | @echo | @report
