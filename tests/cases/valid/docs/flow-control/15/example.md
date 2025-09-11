/exe @validator(input) = when first [
  @input.valid => @input.value
  @ctx.try < 3 => retry "validation failed"
  none => "fallback value"
]

/var @result = "invalid" | @validator
/show @result