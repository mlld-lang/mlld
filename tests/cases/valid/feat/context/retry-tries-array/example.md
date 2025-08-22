/exe @source() = when first [
  @ctx.try <= 2 => "connection failed"  
  * => "data received"
]

/exe @validator() = when first [
  @ctx.input == "connection failed" => retry
  * => "Success on attempt @ctx.try"
]

/var @result = @source() | @validator
/show @result