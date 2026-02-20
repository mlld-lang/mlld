/var pii @val = "alice@example.com"
/exe @echoNode(val) = node { return val }
/var @out = @echoNode(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:node")
