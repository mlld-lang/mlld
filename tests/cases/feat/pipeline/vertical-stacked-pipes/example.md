>> Test vertical/stacked pipe syntax

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addPrefix(input) = js { return "PREFIX-" + input }
/exe @addSuffix(input) = js { return input + "-SUFFIX" }
/exe @reverse(input) = js { return input.split('').reverse().join('') }

/exe @getData() = js { return "hello world" }

>> Test 1: Basic vertical pipes (function result)
/var @test1 = @getData()
  | @toUpper
  | @addPrefix
  | @addSuffix
/show @test1

>> Test 2: Vertical pipes with literal value
/var @test2 = "test data"
  | @toUpper
  | @reverse
  | @addPrefix
  | @addSuffix
/show @test2

>> Test 3: Vertical pipes with file reference
/var @test3 = <test-content.txt>
  | @toUpper
  | @addPrefix
  | @reverse
/show @test3

>> Test 4: Vertical pipes with JSON data
/var @data = {"message": "hello", "type": "greeting"}
/var @test4 = @data
  | @json
  | @addPrefix
  | @addSuffix
/show @test4