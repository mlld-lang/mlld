# Test: Extract from generic code fence

/var @response = `\`\`\`
{"status": "ok", "items": [1, 2, 3]}
\`\`\``

/var @data = @response | @json.llm
/show @data
