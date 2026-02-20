/var pii @email = "alice@example.com"
/exe @render(value) = template "source-taint-template.att"
/var @out = @render(@email)
/show @out
/show @out.mx.taint.includes("pii")
/show @out.mx.taint.includes("src:template")
