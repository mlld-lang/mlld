/var pii @val = "alice@example.com"
/exe @echoJs(val) = js { return val }
/var @out = @echoJs(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:js")
