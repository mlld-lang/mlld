# Guard Composition - Retry Shared Budget

/var secret @data = "value"

/exe @gen(val) = @val

/exe @report(val) = `g0-decision: @p.guards[0].decision, g1-decision: @p.guards[1].decision
@val`

/guard @retryOnce for secret = when [
  @mx.op.type == "pipeline-stage" && @mx.guard.try < 2 => retry "retrying"
  * => allow
]

/show @data | @gen | @report
