/exe @handler(value) = when [
  denied => show "Blocked: @ctx.guard.reason"
  denied => show "Guard: @ctx.guard.name"
  denied => show "Labels: @ctx.labels.join(', ')"
  * => show @value
]