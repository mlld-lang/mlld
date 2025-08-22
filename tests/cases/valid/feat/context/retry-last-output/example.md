/exe @improver() = when first [
  @ctx.try == 1 => retry "Draft v1"
  @ctx.try == 2 => retry "Draft v2" 
  * => "Final version. Previous: @ctx.hint"
]

/show @improver()