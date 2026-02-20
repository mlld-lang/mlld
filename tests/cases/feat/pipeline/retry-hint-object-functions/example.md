# Retry Hint Object Functions Test

/exe @calcCode() = 503
/exe @mkDetail(n) = js { return `try-${n}-detail` }

/exe @source() = when [
  @mx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when [
  @mx.input == "draft" => retry { code: @calcCode(), detail: @mkDetail(@mx.try) }
  * => "Hint: code=@mx.hint.code, detail=@mx.hint.detail"
]

/var @result = @source() | @validator
/show @result
