# Pipeline Alias @p Negative Index Test

/exe @A(x) = `A: @x`
/exe @B(x) = `B: @x`

/exe @showLast() = `Last: @p[-1]`

/var @result = "seed" | @A | @B | @showLast

/show @result

