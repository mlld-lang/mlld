/exe @flaky() = when first [
  @ctx.try < 2 => retry "Not ready"
  * => "Success on try @ctx.try"
]

/exe @process() = "@ctx.input -> processed"

/var @result = @flaky() | @process
/show @result