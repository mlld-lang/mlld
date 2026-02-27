# Guard Composition - Hints Aggregation

/var secret @payload = "x"

/exe @passthrough(val) = @val

/exe @report(val) = `g0-h0: @p.guards[0].hints[0].hint, g0-h1: @p.guards[0].hints[1].hint
g1-h0: @p.guards[1].hints[0].hint
@val`

/guard @retryA for secret = when [
  @mx.op.type == "pipeline-stage" && @mx.guard.try < 2 => retry "hint-a"
  * => allow
]

/guard @retryB for secret = when [
  @mx.op.type == "pipeline-stage" && @mx.guard.try < 3 => retry "hint-b"
  * => allow
]

/show @payload | @passthrough | @report
