# @output Command Tests

This tests outputting variables to commands.

/var @message = "Hello from output!"
/var @results = { "success": true, "count": 42 }

/output @message to "message.txt"
/output @results to "count.txt" as json
/output @message to stdout