/exe @upper(input) = js { return String(input).toUpperCase() }

/var @res = for parallel(2) @x in ["a","b","c","d"] => @upper(@x)
/show @res
