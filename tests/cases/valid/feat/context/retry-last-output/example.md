/exe @generator() = when first [
  @ctx.try == 1 => "draft version 1"
  @ctx.try == 2 => "draft version 2"
  * => "final draft"
]

/exe @formatAccepted() = "Accepted: @ctx.input (try @ctx.try)"

/exe @reviewer() = when first [
  @ctx.input == "draft version 1" => retry
  @ctx.input == "draft version 2" => retry
  * => @formatAccepted()
]

/var @result = @generator() | @reviewer
/show @result