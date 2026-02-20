/exe @passthrough(value) = [
  => @value
]
/var pii @email = "alice@example.com"
/var @out = @passthrough(@email)
/show @out
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:exe")
