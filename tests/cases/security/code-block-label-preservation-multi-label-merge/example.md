/var secret @token = "sk-merge-1"
/var pii @email = "alice@example.com"
/exe @combine(a, b) = js { return `${a}|${b}` }
/var @out = @combine(@token, @email)
/show @out
/show @out.mx.labels.includes("secret")
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("secret")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:js")
