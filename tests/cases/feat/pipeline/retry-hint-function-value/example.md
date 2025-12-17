# Retry Hint Function Value Test

/exe @buildHint(n) = "attempt-@n is insufficient"

/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @mx.input == "draft" => retry @buildHint(@mx.try)
  * => "Hint: @mx.hint"
]

/var @result = @source() | @validator
/show @result
