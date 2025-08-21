/exe @validator() = when first [
  @ctx.try == 1 => retry "Temperature too high"
  * => "Fixed based on hint: @ctx.hint"
]

/var @result = @validator()
/show @result