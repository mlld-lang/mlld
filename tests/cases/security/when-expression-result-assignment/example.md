/var secret @token = "  sk-when-1234  "
/var @result = when [
  true => @token.trim().slice(0, 7)
  * => "safe"
]
/show @result
/show @result.mx.labels.includes("secret")
/show @result.mx.taint.includes("secret")
