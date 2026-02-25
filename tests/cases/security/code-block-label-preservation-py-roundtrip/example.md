/var pii @val = "alice@example.com"
/exe @echoPy(val) = py { print(val, end='') }
/var @out = @echoPy(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:py")
