/exe @upper(input) = js { return String(input).toUpperCase() }

/exe @list() = for parallel(2) @x in ["x","y"] => @upper(@x)
/var @out = @list()
/show @out
