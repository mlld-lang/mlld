# Test: Pipe Sugar with Complex Array

>> Tests the pipe sugar syntax (@data | {command}) with complex data

/var @matrix = [[1,2], [3,4]]
/run { cat } with { stdin: @matrix }
