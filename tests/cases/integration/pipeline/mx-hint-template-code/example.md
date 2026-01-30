# Integration: mx.hint in JS code stage (scoped)

/exe @src() = when [
  @mx.try == 1 => "draft"
  * => `SRC inside hint: @mx.hint`
]

/exe @codeStage(input) = js {
  return "CODE sees: " + (mx.hint ?? "null");
}

/exe @guard(input) = when [
  @mx.try == 1 && @input == "CODE sees: null" => retry "try-1"
  @mx.try == 2 && @input == "CODE sees: try-1" => retry "try-2"
  * => "DONE: @input"
]

/show @src() | @codeStage with { pipeline: [ show `code effect hint: @mx.hint` ] } | @guard

