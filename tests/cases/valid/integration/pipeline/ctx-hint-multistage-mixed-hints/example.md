# Integration: ctx.hint multistage with mixed hints

/exe @s1() = when first [
  @ctx.try == 1 => "seed"
  * => `S1 inside hint: @ctx.hint`
]

/exe @s2(input) = when first [
  @ctx.try == 1 => `S2 first: @input`
  * => `S2 inside hint: @ctx.hint`
]

/exe @s3(input) = when first [
  @ctx.try == 1 && @input == "S2 first: seed" => retry "h1"
  @ctx.try == 2 && @input.includes("S2 inside hint: h1") => retry { code: 400, part: "s2" }
  * => "FINAL: @input"
]

/show @s1() | @s2 with { pipeline: [ show `S2 effect hint: @ctx.hint` ] } | @s3

