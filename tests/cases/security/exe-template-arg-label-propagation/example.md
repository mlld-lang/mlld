/var pii @name = "John Doe"
/exe @echo(input) = cmd { printf "@input" }
/var @direct = @echo(@name)
/var @template = @echo(`hello @name`)
/show @direct.mx.labels
/show @template.mx.labels
