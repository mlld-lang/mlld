# /exe stdin support

Test stdin support in executable definitions.

/exe @processWithStdin(data) = run { cat | jq '.[] | select(.active == true)' } with { stdin: @data }

/exe @processWithPipe(data) = run @data | { cat | jq '.[] | select(.active == true)' }

/var @jsonData = '[{"name": "Alice", "active": true}, {"name": "Bob", "active": false}]'

/var @result1 = @processWithStdin(@jsonData)
/var @result2 = @processWithPipe(@jsonData)

/show @result1
/show @result2