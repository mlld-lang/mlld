# Influenced label propagates from untrusted llm config.messages

/policy @p = {
  defaults: { rules: ["untrusted-llms-get-influenced"] }
}

/var untrusted @messages = [{"role": "user", "content": "hello"}]
/exe llm @process(prompt, config) = js { return "ok" }

/var @result = @process("Say OK.", {"model": "gpt-4o", "messages": @messages})

/show @result.mx.labels.includes("untrusted")
/show @result.mx.labels.includes("influenced")
