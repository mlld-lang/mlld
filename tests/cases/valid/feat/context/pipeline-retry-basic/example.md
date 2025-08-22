/exe @source() = when first [
  @ctx.try < 2 => "not ready"
  * => "Success on try @ctx.try"
]

/exe @process() = when first [
  @ctx.input == "not ready" => retry "Still waiting"
  * => "@ctx.input -> processed"
]

/var @result = @source() | @process
/show @result