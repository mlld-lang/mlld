/var @messy = [[mix "quo'te" \\ slash backtick ` bar | baz]]

/exe @pipeMessy(value) = @value | cmd { printf "%s" "@value" | tr a-z A-Z }

/show @pipeMessy(@messy)
