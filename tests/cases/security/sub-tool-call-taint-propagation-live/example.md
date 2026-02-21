/var animal @data = "horse"

/exe llm @askClaude(prompt) = cmd { claude -p "@prompt" --output-format text }
/exe net:r @fetch(data) = `fetched:@data`

/exe llm @agentSkips(data) = [
  => `safe response`
]

/exe llm @agentCalls(data) = [
  let @network = @fetch(@data)
  => @askClaude(`Reply with exactly: ok`)
]

/var @skip = @agentSkips(@data)
/show @skip.mx.taint.includes("animal")
/show @skip.mx.taint.includes("llm")
/show @skip.mx.taint.includes("net:r")

/var @call = @agentCalls(@data)
/show @call.mx.taint.includes("animal")
/show @call.mx.taint.includes("llm")
/show @call.mx.taint.includes("net:r")

/var @skipAgain = @agentSkips(@data)
/show @skipAgain.mx.taint.includes("net:r")
