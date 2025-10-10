# Test: Nested Arrays via Stdin

/var @matrix = [[1,2,3], [4,5,6], [7,8,9]]
/run { cat } with { stdin: @matrix }
