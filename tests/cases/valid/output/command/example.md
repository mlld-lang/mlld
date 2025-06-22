# @output Command Tests

This tests outputting variables to commands.

/text @message = "Hello from output!"
/data @results = { "success": true, "count": 42 }

/output @message to "message.txt"
/output @results to "count.txt" as json
/output @message to stdout