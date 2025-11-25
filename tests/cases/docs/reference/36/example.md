/exe @validator(input) = when [
  @input.valid => @input
  @ctx.try < 3 => retry "need more validation"
  * => "fallback"
]