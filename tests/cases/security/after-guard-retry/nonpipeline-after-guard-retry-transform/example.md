# After guard retry applies transforms per attempt

/guard after @sanitize for retryable = when [
  @ctx.guard.try < 2 => retry "retry first"
  @output != "clean" => allow "clean"
]

/exe @dirty() = js { return "dirty"; }

/var retryable @value = @dirty()
/show `value: @value`
