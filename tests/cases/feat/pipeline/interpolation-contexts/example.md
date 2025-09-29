>> Test pipes in various interpolation contexts
>> Condensed syntax only (no spaces, no args) as per llms.txt

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addBrackets(input) = js { return "[" + input + "]" }

>> Setup data
/var @name = "alice"
/var @data = {"type": "user", "role": "admin"}

>> Test 1: Pipes in backtick templates
/var @test1 = `Hello @name|@toUpper|@addBrackets!`
/show @test1

>> Test 2: Pipes with file references in backticks
/var @test2 = `Content: <test-data.json>|@json|@addBrackets`
/show @test2

>> Test 3: Pipes in double-colon templates
/var @test3 = ::The user is @name|@toUpper with data @data|@json::
/show @test3

>> Test 4: Variable pipes in double quotes (interpolation context)
/var @test4 = "User: @name|@toUpper"
/show @test4

>> Test 5: Multiple pipes in template with file reference
/var @test5 = `<test-file.txt>|@toUpper|@addBrackets and @name|@toUpper|@addBrackets`
/show @test5