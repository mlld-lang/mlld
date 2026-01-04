# Integration: mx.hint flow (string hint)

/exe @source() = when first [
  @mx.try == 1 => "draft"
  * => `S1 hint: @mx.hint`
]

/exe @validator() = when first [
  @mx.input == "draft" => retry "need-fix"
  * => "final"
]

/show @source() | show | @validator
