/var pii @val = "alice@example.com"
/exe @upperJs(val) = js { return String(val).toUpperCase() }
/var @out = @upperJs(@val)
/show @out
/show @out.mx.labels.includes("pii")
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:js")
