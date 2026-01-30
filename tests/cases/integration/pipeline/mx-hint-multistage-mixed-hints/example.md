# Integration: mx.hint multistage with mixed hints

/exe @s1() = when [
  @mx.try == 1 => "seed"
  * => `S1 inside hint: @mx.hint`
]

/exe @s2(input) = when [
  @mx.try == 1 => `S2 first: @input`
  * => `S2 inside hint: @mx.hint`
]

/exe @s3(input) = when [
  @mx.try == 1 && @input == "S2 first: seed" => retry "h1"
  @mx.try == 2 && @input.includes("S2 inside hint: h1") => retry { code: 400, part: "s2" }
  * => "FINAL: @input"
]

/show @s1() | @s2 with { pipeline: [ show `S2 effect hint: @mx.hint` ] } | @s3

