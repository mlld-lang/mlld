# Retry Hint Object Test

/exe @source() = when [
  @mx.try == 1 => { code: 429, tries: @mx.try }
  * => { code: 200 }
]

/exe @validator() = when [
  @mx.input.code == 429 => retry { code: 429, reason: "rate limit", try: @pipeline.try }
  * => "Hint code: @mx.hint.code, reason: @mx.hint.reason, try: @mx.hint.try"
]

/var @result = @source() | @validator
/show @result
