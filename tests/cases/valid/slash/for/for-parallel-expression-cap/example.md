/exe @upper(input) = js { return String(input).toUpperCase() }

/var @res = for 2 parallel @x in ["a","b","c","d"] => @upper(@x)
/show @res

