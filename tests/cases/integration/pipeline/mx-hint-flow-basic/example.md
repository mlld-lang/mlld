# Integration: mx.hint flow (string hint)

/exe @source() = when [
  @mx.try == 1 => "draft"
  * => `S1 hint: @mx.hint`
]

/exe @validator() = when [
  @mx.input == "draft" => retry "need-fix"
  * => "final"
]

/show @source() | show | @validator
