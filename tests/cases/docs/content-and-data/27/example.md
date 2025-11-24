>> Extract from code fence
/var @llmResponse = `Here's your data:
\`\`\`json
{"name": "Alice", "status": "active"}
\`\`\``

/var @data = @llmResponse | @json.llm
/show @data.name                                >> Alice

>> Extract from inline prose
/var @inline = `The result is {"count": 42} for this query.`
/var @extracted = @inline | @json.llm
/show @extracted.count                          >> 42

>> Returns false when no JSON found
/var @text = `Just plain text, no JSON here.`
/var @result = @text | @json.llm
/show @result                                   >> false