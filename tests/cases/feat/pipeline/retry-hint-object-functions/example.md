# Retry Hint Object Functions Test

/exe @calcCode() = 503
/exe @mkDetail(n) = js { return `try-${n}-detail` }

/exe @source() = when first [
  @ctx.try == 1 => "draft"
  * => "final"
]

/exe @validator() = when first [
  @ctx.input == "draft" => retry { code: @calcCode(), detail: @mkDetail(@ctx.try) }
  * => "Hint: code=@ctx.hint.code, detail=@ctx.hint.detail"
]

/var @result = @source() | @validator
/show @result
