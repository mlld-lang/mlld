# Guard Composition - Retry Shared Budget

/guard @retryOnce for op:exe = when [
  @ctx.guard.try < 2 => retry "retrying"
  * => allow
]

/exe @gen() = {
  "value"
}

/exe @report(val) = {
  /show `decisions: @p.guards.map(g => g.decision)`
  @val
}

/show @gen() | @report
