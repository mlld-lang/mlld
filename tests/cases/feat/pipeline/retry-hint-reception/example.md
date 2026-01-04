# Retry Hint Reception Test

/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @mx.input == "draft" => retry "missing title"
  * => "Used hint: @mx.hint"
]

/var @result = @source() | @validator
/show @result
