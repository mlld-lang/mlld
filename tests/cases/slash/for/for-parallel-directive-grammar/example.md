/exe @upper(input) = js { return String(input).toUpperCase() }

/for 1 parallel @x in ["a","b","c"] => show @upper(@x)

