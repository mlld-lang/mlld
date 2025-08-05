/var @a = "first"
/var @b = "second"
/var @empty = ""
/var @nullVar = null

>> && returns the first falsy value or the last value
/var @and1 = @a && @b
/var @and2 = @empty && @b
/var @and3 = @nullVar && @b

>> || returns the first truthy value or the last value
/var @or1 = @a || @b
/var @or2 = @empty || @b
/var @or3 = @nullVar || @b

/show "AND Results:"
/show @and1
/show @and2
/show @and3

/show "\nOR Results:"
/show @or1
/show @or2
/show @or3