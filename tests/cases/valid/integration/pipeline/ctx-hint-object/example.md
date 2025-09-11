# Integration: ctx.hint flow (object hint)

/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => `S1 hint: @ctx.hint`
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry { code: 429, reason: "rate-limit" }
  * => "final"
]

/show @source() | show | @validator
