/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry "missing title"
  * => `Used hint: @ctx.hint`
]

/var @result = @source() | @validator
/show @result