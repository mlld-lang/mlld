/var @payload = 'stdin verifies flow'

/exe @uppercaseViaRun(data) = run { node -e "process.stdin.on('data', chunk => process.stdout.write(chunk.toString().toUpperCase()))" } with { stdin: @data }

/var @result = @uppercaseViaRun(@payload)

/show @result
