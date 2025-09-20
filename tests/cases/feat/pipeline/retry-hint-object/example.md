# Retry Hint Object Test

/exe @source() = when first [
  @ctx.try == 1 => { code: 429, tries: @ctx.try }
  * => { code: 200 }
]

/exe @validator() = when first [
  @ctx.input.code == 429 => retry { code: 429, reason: "rate limit", try: @pipeline.try }
  * => "Hint code: @ctx.hint.code, reason: @ctx.hint.reason, try: @ctx.hint.try"
]

/var @result = @source() | @validator
/show @result
