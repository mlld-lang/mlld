>> Test multiple chained pipes (3+ transformations)

/exe @addPrefix(input) = js { return "PREFIX-" + input }
/exe @addSuffix(input) = js { return input + "-SUFFIX" }
/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @reverse(input) = js { return input.split('').reverse().join('') }

>> Test 1: Four chained pipes
/var @test1 = "hello" | @addPrefix | @addSuffix | @toUpper | @reverse
/show @test1

>> Test 2: Five chained pipes with built-in transformer
/var @data = {"name": "alice", "age": 30}
/var @test2 = @data | @json | @addPrefix | @toUpper | @addSuffix | @reverse
/show @test2

>> Test 3: Six chained pipes
/exe @trim(input) = js { return input.trim() }
/exe @double(input) = js { return input + input }
/var @test3 = "  test  " | @trim | @addPrefix | @toUpper | @double | @addSuffix | @reverse
/show @test3
