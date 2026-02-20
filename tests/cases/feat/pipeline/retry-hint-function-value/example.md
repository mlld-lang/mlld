# Retry Hint Function Value Test

/exe @buildHint(n) = "attempt-@n is insufficient"

/exe @source() = when [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when [
  @mx.input == "draft" => retry @buildHint(@mx.try)
  * => "Hint: @mx.hint"
]

/var @result = @source() | @validator
/show @result
