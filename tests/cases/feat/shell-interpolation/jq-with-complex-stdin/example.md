# Test: JQ with Complex JSON via Stdin

>> Real-world use case: piping complex JSON to jq

/var @data = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/run { jq '.[0].name' } with { stdin: @data }
