>> Test pipes in /when all and /when any actions

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addBrackets(input) = js { return "[" + input + "]" }

/var @isValid = true
/var @hasPermission = true
/var @isActive = false

>> Test 1: When all with piped action
/when all [@isValid @hasPermission] => /show "all conditions met" | @toUpper | @addBrackets

>> Test 2: When any with piped action  
/when any [@isActive @hasPermission] => /show "at least one true" | @toUpper

>> Test 3: When all with implicit var and pipes
/var @data = "process"
/when all [@isValid @hasPermission] => @result1 = @data | @toUpper | @addBrackets
/show @result1

>> Test 4: When any with function call and pipes
/exe @getMessage() = js { return "message" }
/when any [@isActive @isValid] => @result2 = @getMessage() | @toUpper | @addBrackets
/show @result2