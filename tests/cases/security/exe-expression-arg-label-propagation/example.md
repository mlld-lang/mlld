/var pii @name = "John Doe"
/var @flag = true
/exe @echo(input) = cmd { printf "@input" }
/var @result = @echo(@flag ? @name : "x")
/show @result.mx.labels
