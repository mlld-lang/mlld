# Built-in Transformers

mlld provides built-in transformers for common data format conversions. These are available as both uppercase (canonical) and lowercase (convenience) forms.

## Available Transformers

### @XML / @xml (Transformer variables)
Converts content to SCREAMING_SNAKE_CASE XML using llmxml.

```mlld
/var @data = ::{"user": {"firstName": "Alice", "lastName": "Smith"}}::
/var @result = @data | @XML
/show @result
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
/var @data = ::{"name":"Alice","age":30,"active":true}::
/var @result = @data | @JSON
/show @result
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
/var @data = ::[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}::]
/var @result = @data | @CSV
/show @result
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
/var @data = ::# Hello World

This is a paragraph with **bold** and *italic* text.

- Item 1
- Item 2::

/var @result = @data | @MD
/show @result
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
/var @result = /run {curl -s api.example.com/users} | @json | @csv
/show @result

>> Multiple transformations
/var @report = /run {cat data.json} | @json | @uppercase | @md
/show @report
```

## With /exec Functions

Combine transformers with custom functions:

```mlld
/exe @processUsers(data) = ::
Total users: {{data.length}}
First user: {{data.0.name}}
::

/var @result = /run {cat users.json} | @json | @processUsers
/show @result
```

## Error Handling

Transformers validate input and provide clear error messages:

```mlld
>> Invalid JSON input
/var @result = /run {echo "not json"} | @json
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
/var @result1 = @data | @JSON
/var @result2 = @data | @json
```

Use uppercase for clarity in documentation, lowercase for convenience in scripts.

## See Also

- [Pipelines](pipeline.md) - Using the pipeline operator
- [Custom Transformers](exec.md#transformers) - Creating your own transformers
- [With Clauses](with.md) - Alternative pipeline syntax