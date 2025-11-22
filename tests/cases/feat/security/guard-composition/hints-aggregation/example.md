# Guard Composition - Hints Aggregation

/guard @retryA for secret = when [
  @ctx.guard.try < 2 => retry "hint-a"
  * => allow
]

/guard @retryB for secret = when [
  @ctx.guard.try < 3 => retry "hint-b"
  * => allow
]

/var secret @payload = "x"

/exe @passthrough(val) = cmd { @val }

/exe @report(val) = cmd {
  /show `hints: @p.guards.map(g => g.hints.map(h => h.hint).join("|")).join(",")`
  @val
}

/show @payload | @passthrough | @report
