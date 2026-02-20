/var pii @val = "alice@example.com"
/exe @echoSh(val) = sh { printf "%s" "$val" }
/var @out = @echoSh(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:sh")
