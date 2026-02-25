# Guard Composition - Deny Beats Retry But Hints Accumulate

/var secret @token = "abc"

/exe @process(value) = when [
  denied => [
    show `decision: @mx.guard.decision`
    show `hint: @mx.guard.hints[0].hint`
    show `reason: @mx.guard.reason`
  ]
  * => show "should not run"
]

/guard @denyGuard for secret = when [
  @mx.op.name == "process" => deny "hard stop"
  * => allow
]

/guard @retryGuard for secret = when [
  @mx.op.name == "process" => retry "need retry"
  * => allow
]

/show @token | @process
