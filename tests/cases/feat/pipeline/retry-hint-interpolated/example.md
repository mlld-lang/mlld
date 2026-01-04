# Retry Hint Interpolated Test

/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @mx.input == "draft" => retry "Missing field on try @pipeline.try"
  * => "Hint was: @mx.hint"
]

/var @result = @source() | @validator
/show @result
