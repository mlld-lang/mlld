/exe @process(value) = when [
  denied => show "Blocked by: @ctx.guard.name"
  denied => show "Reason: @ctx.guard.reason"
  denied => show "Decision: @ctx.guard.decision"
  denied => show "All reasons: @ctx.guard.reasons.join(', ')"
  * => show @value
]