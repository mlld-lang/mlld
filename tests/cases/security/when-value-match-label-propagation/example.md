/var secret @token = "alpha"
/var @mode = "secret"
/var @result = when @mode [
  "public" => "safe"
  "secret" => @token
  * => "fallback"
]
/show @result
/show @result.mx.labels.includes("secret")
/show @result.mx.taint.includes("secret")
