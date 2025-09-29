# Retry Hint Interpolated Test

/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry "Missing field on try @pipeline.try"
  * => "Hint was: @ctx.hint"
]

/var @result = @source() | @validator
/show @result
