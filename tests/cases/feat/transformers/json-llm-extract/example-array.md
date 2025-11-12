# Test: Extract JSON array

/var @response = `The items are: [1, 2, 3, 4, 5]`

/var @array = @response | @json.llm
/show @array
