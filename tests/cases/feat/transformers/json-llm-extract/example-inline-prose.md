# Test: Extract JSON from prose

/var @response = `The result is {"name": "Bob", "active": true} which indicates success.`

/var @extracted = @response | @json.llm
/show @extracted
