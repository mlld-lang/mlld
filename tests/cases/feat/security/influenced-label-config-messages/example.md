# Influenced label propagates from parsed untrusted messages stored in a config object

/policy @p = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}

/var untrusted @messagesJson = "[{\"role\": \"user\", \"content\": \"hello\"}]"
/var @messages = @messagesJson | @parse
/var @config = {"model": "gpt-4o", "messages": @messages}
/exe llm @process(prompt, config) = js { return "ok" }

/var @result = @process("Say OK.", @config)

/show @config.mx.labels.includes("untrusted")
/show @config.messages.mx.labels.includes("untrusted")
/show @result.mx.labels.includes("untrusted")
/show @result.mx.labels.includes("influenced")
