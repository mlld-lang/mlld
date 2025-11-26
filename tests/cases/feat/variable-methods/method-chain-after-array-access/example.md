# Method Chaining After Array Access

Test method chaining works correctly after array access operations.

/var @array = ["one ", "two ", "three "]
/var @message = "hello_world_test"
/var @data = "  spaced  item  "

# Chain method after array literal access
/var @test1 = @array[0].trim()
/show @test1

# Chain method after split result with array access
/var @test2 = @message.split("_")[0].toUpperCase()
/show @test2

# Chain methods after split with array access
/var @test3 = @message.split("_")[1].trim().toUpperCase()
/show @test3

# Multiple chained methods
/var @test4 = @data.trim().split(" ")[0].toUpperCase()
/show @test4
