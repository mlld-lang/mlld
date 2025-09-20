/exe @upper(input) = js { return String(input).toUpperCase() }

/exe @list() = for 2 parallel @x in ["x","y"] => @upper(@x)
/var @out = @list()
/show @out
