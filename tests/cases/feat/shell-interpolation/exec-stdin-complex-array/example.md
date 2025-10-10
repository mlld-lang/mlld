# Test: Exec Function with Stdin Complex Array

/exe @display(items) = run { cat } with { stdin: @items }

/var @data = [[10, 20], [30, 40]]
/show @display(@data)
