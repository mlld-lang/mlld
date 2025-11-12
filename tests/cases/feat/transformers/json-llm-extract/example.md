# Test: Extract JSON from markdown code fence

/var @llmResponse = `Here is the data:
\`\`\`json
{"name": "Alice", "age": 30}
\`\`\`
That's all!`

/var @extracted = @llmResponse | @json.llm
/show @extracted
