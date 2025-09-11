# Integration: ctx.hint flow (string hint)

/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => `S1 hint: @ctx.hint`
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry "need-fix"
  * => "final"
]

/show @source() | show | @validator
