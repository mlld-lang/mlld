# Test: Return false for invalid JSON

/var @response = `{this is not valid json at all}`

/var @result = @response | @json.llm
/show @result
