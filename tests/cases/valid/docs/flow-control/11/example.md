/exe @upper(s) = js { return String(s).toUpperCase() }

# Directive form (streams as done; order not guaranteed)
/for parallel @x in ["a","b","c","d"] => show @x

# Cap override and pacing between task starts
/for (2, 1s) parallel @n in [1,2,3,4] => show `Item: @n`

# Collection form (preserves input order)
/var @res = for 2 parallel @x in ["x","y","z"] => @upper(@x)
/show @res