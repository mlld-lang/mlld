# Test: Return false when no JSON found

/var @response = `This is just plain text with no JSON structure at all.`

/var @result = @response | @json.llm
/show @result
