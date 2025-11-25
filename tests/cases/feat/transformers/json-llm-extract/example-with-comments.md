# Test: Extract JSON5 with comments

/var @response = `\`\`\`json
{
  // User object
  "name": "Charlie",
  "tags": [1, 2, 3,],
}
\`\`\``

/var @parsed = @response | @json.llm
/show @parsed
