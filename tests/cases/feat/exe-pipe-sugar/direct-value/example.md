/exe @pipe(value) = @value | cmd { tr a-z A-Z }
/show @pipe("abc123")
