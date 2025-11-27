>> Test pipes in /when with && and || operators

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addBrackets(input) = js { return "[" + input + "]" }

/var @isValid = true
/var @hasPermission = true
/var @isActive = false

>> Test 1: When && with piped action
/when (@isValid && @hasPermission) => show "all conditions met" | @toUpper | @addBrackets

>> Test 2: When || with piped action
/when (@isActive || @hasPermission) => show "at least one true" | @toUpper

>> Test 3: When && with explicit var and pipes
/var @data = "process"
/when (@isValid && @hasPermission) => var @result1 = @data | @toUpper | @addBrackets
/show @result1

>> Test 4: When || with function call and pipes
/exe @getMessage() = js { return "message" }
/when (@isActive || @isValid) => var @result2 = @getMessage() | @toUpper | @addBrackets
/show @result2
