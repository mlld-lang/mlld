>> Test pipes in withClause syntax
>> /var @var = @func() with { pipeline: [@pipe, @other] }

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addBrackets(input) = js { return "[" + input + "]" }
/exe @reverse(input) = js { return input.split('').reverse().join('') }

/exe @getData() = js { return "hello world" }
/exe @getJson() = js { return {name: "alice", age: 30} }

>> Test 1: Basic withClause pipeline
/var @test1 = @getData() with { pipeline: [@toUpper] }
/show @test1

>> Test 2: Multiple pipes in withClause
/var @test2 = @getData() with { pipeline: [@toUpper, @addBrackets, @reverse] }
/show @test2

>> Test 3: withClause with format specification
/var @test3 = @getJson() with { format: "json", pipeline: [@json, @addBrackets] }
/show @test3

>> Test 4: Command execution with withClause pipeline
/var @test4 = run {echo "test"} with { pipeline: [@toUpper, @addBrackets] }
/show @test4

>> Test 5: Nested function calls with withClause
/exe @process(data) = js { return "processed: " + data }
/var @test5 = @process(@getData()) with { pipeline: [@toUpper, @reverse] }
/show @test5