# Integration: mx.hint flow (object hint)

/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => `S1 hint: @mx.hint`
]

/exe @validator() = when first [
  @mx.input == "draft" => retry { code: 429, reason: "rate-limit" }
  * => "final"
]

/show @source() | show | @validator
