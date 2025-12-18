/exe @handler(value) = when [
  denied => show "Operation blocked: @mx.guard.reason"
  denied => "fallback-value"
  * => @value
]