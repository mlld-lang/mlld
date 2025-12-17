/exe @isValidJson(text) = js {
  try { JSON.parse(text); return true; }
  catch { return false; }
}

/guard @validateJson after op:exe = when [
  @mx.op.name == "llmCall" && !@isValidJson(@output) => deny "Invalid JSON from LLM"
  * => allow
]