# Retry Hint Interpolated Test

/exe @source() = when [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when [
  @mx.input == "draft" => retry "Missing field on try @pipeline.try"
  * => "Hint was: @mx.hint"
]

/var @result = @source() | @validator
/show @result
