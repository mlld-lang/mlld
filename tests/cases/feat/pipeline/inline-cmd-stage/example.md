/var @source = "abc"

/var @result = @source | cmd { tr a-z A-Z }

/show @result
