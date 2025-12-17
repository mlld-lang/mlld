/exe @handler(value) = when [
  denied => show "Blocked: @mx.guard.reason"
  denied => show "Guard: @mx.guard.name"
  denied => show "Labels: @mx.labels.join(', ')"
  * => show @value
]