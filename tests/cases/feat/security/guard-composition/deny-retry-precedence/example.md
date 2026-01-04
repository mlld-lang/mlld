# Guard Composition - Deny Beats Retry But Hints Accumulate

/guard @retryGuard for secret = when [
  * => retry "need retry"
]

/guard @denyGuard for secret = when [
  * => deny "hard stop"
]

/var secret @token = "abc"

/exe @process(value) = when [
  denied => show `decision: @mx.guard.decision`
  denied => show `hint: @mx.guard.hints[0].hint`
  denied => show `reason: @mx.guard.reason`
  * => show "should not run"
]

/show @process(@token)
