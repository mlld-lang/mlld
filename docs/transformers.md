# Built-in Transformers

mlld provides built-in transformers for common data format conversions. These are available as both uppercase (canonical) and lowercase (convenience) forms.

## Available Transformers

### @XML / @xml (Transformer variables)
Converts content to SCREAMING_SNAKE_CASE XML using llmxml.

```mlld
/text @data = [[{"user": {"firstName": "Alice", "lastName": "Smith"}}]]
/text @result = @data | @XML
/add @result
```

Output:
```xml
<USER>
  <FIRST_NAME>Alice</FIRST_NAME>
  <LAST_NAME>Smith</LAST_NAME>
</USER>
```

### @JSON / @json (Transformer variables)
Formats JSON data with proper indentation.

```mlld
/text @data = [[{"name":"Alice","age":30,"active":true}]]
/text @result = @data | @JSON
/add @result
```

Output:
```json
{
  "name": "Alice",
  "age": 30,
  "active": true
}
```

### @CSV / @csv (Transformer variables)
Converts JSON arrays to CSV format.

```mlld
/text @data = [[[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]]]
/text @result = @data | @CSV
/add @result
```

Output:
```csv
name,age
Alice,30
Bob,25
```

### @MD / @md (Transformer variables)
Formats content as clean Markdown using prettier.

```mlld
/text @data = [[# Hello World

This is a paragraph with **bold** and *italic* text.

- Item 1
- Item 2]]

/text @result = @data | @MD
/add @result
```

Output:
```markdown
# Hello World

This is a paragraph with **bold** and _italic_ text.

- Item 1
- Item 2
```

## Usage in Pipelines

Transformers work seamlessly in pipelines:

```mlld
>> API response to formatted CSV
/text @result = /run {curl -s api.example.com/users} | @json | @csv
/add @result

>> Multiple transformations
/text @report = /run {cat data.json} | @json | @uppercase | @md
/add @report
```

## With /exec Functions

Combine transformers with custom functions:

```mlld
/exec @processUsers(data) = [[
Total users: {{data.length}}
First user: {{data.0.name}}
]]

/text @result = /run {cat users.json} | @json | @processUsers
/add @result
```

## Error Handling

Transformers validate input and provide clear error messages:

```mlld
>> Invalid JSON input
/text @result = /run {echo "not json"} | @json
>> Error: Transformer JSON failed: Unexpected token...
```

## Performance Notes

- Transformers process data synchronously
- Large datasets may take time to process
- @CSV handles nested objects by flattening them
- @MD preserves existing formatting where possible

## Uppercase vs Lowercase

Both forms are identical in function:

```mlld
>> These produce the same result
/text @result1 = @data | @JSON
/text @result2 = @data | @json
```

Use uppercase for clarity in documentation, lowercase for convenience in scripts.

## See Also

- [Pipelines](pipeline.md) - Using the pipeline operator
- [Custom Transformers](exec.md#transformers) - Creating your own transformers
- [With Clauses](with.md) - Alternative pipeline syntax