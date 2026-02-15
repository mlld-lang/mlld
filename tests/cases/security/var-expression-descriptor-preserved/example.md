/var secret @key = "sk-123"
/var @public = "safe"
/var @result = @key == "sk-123" ? @key : @public
/var @resultCtx = @result.mx
/var @sum = 3 + 5
/show @result
/show @resultCtx.taint.includes("secret")
/show @sum
