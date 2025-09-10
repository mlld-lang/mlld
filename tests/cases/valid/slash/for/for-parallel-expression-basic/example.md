/exe @upper(input) = js { return String(input).toUpperCase() }

/var @res = for parallel @x in ["a","b","c"] => @upper(@x)
/show @res

