# Guard Composition - Retry Shared Budget

/guard @retryOnce for op:exe = when [
  @mx.guard.try < 2 => retry "retrying"
  * => allow
]

/exe @gen() = cmd {
  "value"
}

/exe @report(val) = cmd {
  /show `decisions: @p.guards.map(g => g.decision)`
  @val
}

/show @gen() | @report
