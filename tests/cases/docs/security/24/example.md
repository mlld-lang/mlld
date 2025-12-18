/exe @process(value) = when [
  denied => show "Blocked by: @mx.guard.name"
  denied => show "Reason: @mx.guard.reason"
  denied => show "Decision: @mx.guard.decision"
  denied => show "All reasons: @mx.guard.reasons.join(', ')"
  * => show @value
]