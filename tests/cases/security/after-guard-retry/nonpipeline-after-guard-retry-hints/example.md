# After guard retry exposes hints and tries

/guard after @hinty for retryable = when [
  @output != "good" && @mx.guard.try == 1 => retry "first hint"
  @output != "good" && @mx.guard.try == 2 => retry "second hint"
  @output != "good" => allow `final-hint:@mx.guard.hintHistory[1] tries:@mx.guard.tries.length`
  * => allow
]

/exe @twoStep() = js { return "bad"; }

/var retryable @value = @twoStep()
/show `value: @value`
