/var secret @token = "sk-method-987"
/var @upper = @token.toUpperCase()
/var @replaced = @token.replace("method", "m")
/var @sub = @token.substring(0, 5)
/show @upper
/show @replaced
/show @sub
/show @upper.mx.labels.includes("secret")
/show @replaced.mx.labels.includes("secret")
/show @sub.mx.labels.includes("secret")
/show @upper.mx.taint.includes("secret")
/show @replaced.mx.taint.includes("secret")
/show @sub.mx.taint.includes("secret")
