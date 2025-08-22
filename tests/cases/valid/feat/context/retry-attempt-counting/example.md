/exe @dataSource() = when first [
  @ctx.try == 1 => "error: timeout"
  @ctx.try == 2 => "error: rate limited"
  * => "success: data loaded"
]

/exe @processor() = when first [
  @ctx.input == "error: timeout" => retry
  @ctx.input == "error: rate limited" => retry
  * => "Processed successfully on attempt @ctx.try: @ctx.input"
]

/var @result = @dataSource() | @processor
/show @result