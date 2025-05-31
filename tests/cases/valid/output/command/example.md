# @output Command Tests

This tests outputting variables to commands.

@text message = "Hello from output!"
@data results = { "success": true, "count": 42 }

@output @message to [cat > message.txt]
@output @results to [jq '.count' > count.txt] as json
@output @message to [wc -w]