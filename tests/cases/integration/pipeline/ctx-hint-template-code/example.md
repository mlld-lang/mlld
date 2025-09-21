# Integration: ctx.hint in JS code stage (scoped)

/exe @src() = when first [
  @ctx.try == 1 => "draft"
  * => `SRC inside hint: @ctx.hint`
]

/exe @codeStage(input) = js {
  return "CODE sees: " + (ctx.hint ?? "null");
}

/exe @guard(input) = when first [
  @ctx.try == 1 && @input == "CODE sees: null" => retry "try-1"
  @ctx.try == 2 && @input == "CODE sees: try-1" => retry "try-2"
  * => "DONE: @input"
]

/show @src() | @codeStage with { pipeline: [ show `code effect hint: @ctx.hint` ] } | @guard

