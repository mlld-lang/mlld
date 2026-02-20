>> Test pipes in /when actions

/exe @toUpper(input) = js { return input.toUpperCase() }
/exe @addPrefix(input) = js { return "PREFIX-" + input }

/var @status = "active"
/var @message = "hello"

>> Test 1: Simple when with piped action
/when @status == "active" => show @message | @toUpper

>> Test 2: When with multiple conditions and piped actions
/var @level = 6
/when [
  @level > 10 => show "high" | @toUpper | @addPrefix
  @level > 5 => show "medium" | @toUpper
  * => show "low"
]

>> Test 3: When with explicit var assignment and pipes
/var @data = "test"
/when @status == "active" => var @result = @data | @toUpper | @addPrefix
/show @result

>> Test 4: When with complex expression and piped result
/var @isValid = true
/var @hasAccess = true
/when @isValid && @hasAccess => show "granted" | @toUpper | @addPrefix
