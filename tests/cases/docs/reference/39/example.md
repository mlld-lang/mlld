/exe @validator(input) = when [
  @input.valid => @input
  @mx.try < 3 => retry "need more validation"
  * => "fallback"
]