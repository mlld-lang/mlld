# Retry Hint Function Value Test

/exe @buildHint(n) = "attempt-@n is insufficient"

/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry @buildHint(@ctx.try)
  * => "Hint: @ctx.hint"
]

/var @result = @source() | @validator
/show @result
