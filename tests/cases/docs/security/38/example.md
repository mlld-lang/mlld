/exe @handler(value) = when [
  denied => show "Operation blocked: @ctx.guard.reason"
  denied => "fallback-value"
  * => @value
]