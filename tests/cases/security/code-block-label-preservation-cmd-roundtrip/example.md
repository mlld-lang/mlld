/var pii @val = "alice@example.com"
/exe @echoCmd(val) = cmd { printf "%s" "@val" }
/var @out = @echoCmd(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:cmd")
