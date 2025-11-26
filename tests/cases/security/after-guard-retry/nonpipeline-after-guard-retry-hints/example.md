# After guard retry exposes hints and tries

/guard after @hinty for retryable = when [
  @output != "good" && @ctx.guard.try == 1 => retry "first hint"
  @output != "good" && @ctx.guard.try == 2 => retry "second hint"
  @output != "good" => allow `final-hint:@ctx.guard.hintHistory[1] tries:@ctx.guard.tries.length`
  * => allow
]

/exe @twoStep() = js { return "bad"; }

/var retryable @value = @twoStep()
/show `value: @value`
