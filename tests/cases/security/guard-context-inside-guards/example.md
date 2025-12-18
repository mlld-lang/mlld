# Guard context is visible inside guard evaluation

/guard @captureContext before retryable = when [
  * => allow `guard-try:@mx.guard.try hints:@mx.guard.hintHistory.length`
]

/exe retryable @seed() = js { return "anything"; }
/exe @echo(value) = js { return value; }

/var retryable @value = @seed() with { pipeline: [@echo] }
/show `value: @value`
