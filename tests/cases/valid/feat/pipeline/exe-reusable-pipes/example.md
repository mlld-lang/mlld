>> Test defining and reusing pipe transformers in /exe

>> Define reusable transformers
/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @toLower(input) = js { return input.toLowerCase() }
/exe @addBrackets(input) = js { return "[" + input + "]" }
/exe @trim(input) = js { return input.trim() }
/exe @double(input) = js { return input + input }

>> Define composite transformers that use other transformers
/exe @processTitle(input) = js { 
  return input.trim().toUpperCase() 
}

/exe @formatMessage(input) = js {
  return "MESSAGE: " + input.toUpperCase()
}

>> Test 1: Reuse same pipe in multiple places
/var @name1 = "alice" | @toUpper
/var @name2 = "bob" | @toUpper
/show @name1
/show @name2

>> Test 2: Compose pipes in different combinations
/var @test1 = "  hello  " | @trim | @toUpper | @addBrackets
/var @test2 = "  WORLD  " | @trim | @toLower | @addBrackets
/show @test1
/show @test2

>> Test 3: Use same pipe multiple times in chain
/var @test3 = "hi" | @double | @double | @toUpper
/show @test3

>> Test 4: Mix custom and built-in transformers
/var @data = {"name": "test"}
/var @test4 = @data | @json | @processTitle | @addBrackets
/show @test4

>> Test 5: Reuse pipes across different contexts
/exe @process(value) = js { return value }
/var @test5a = @process("input") | @formatMessage
/var @test5b = "direct" | @formatMessage
/show @test5a
/show @test5b