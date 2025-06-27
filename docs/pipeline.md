# Pipelines

mlld supports Unix-style pipelines for chaining commands and transformations together. The pipeline operator `|` passes the output of one command as input to the next.

## Basic Syntax

Use the `|` operator to chain commands:

```mlld
/var @result = /run "echo hello world" | @uppercase
/show @result
```

Output:
```
HELLO WORLD
```

## How Pipelines Work

1. **Output flows left to right**: Each command's output becomes stdin for the next
2. **@INPUT variable created**: Each step gets an @INPUT variable with the piped data
3. **Smart parameter binding**: Functions without arguments get intelligent parameter handling
4. **Child environments**: Each step runs in a child environment with parent access
5. **Synchronous execution**: Steps execute in order, waiting for each to complete

## Smart Parameter Handling

When piping to multi-parameter functions, mlld intelligently handles JSON data:

```mlld
/exe @process(items, filter) = ::
Processing {{items}} with filter {{filter}}
::

/var @result = /run "echo '{\"items\": [1,2,3], \"filter\": \"active\"}'" | @process
/show @result
```

Output:
```
Processing [1,2,3] with filter active
```

### How It Works

- If the input is valid JSON matching parameter names, values are destructured
- Parameters are matched by name from the JSON object
- Non-matching or non-JSON input goes to the first parameter

## Pipeline Components

### Sources (Left Side)
- `/run "command"` - Execute shell commands
- Variable references - Use existing variables
- Imported functions - From modules

### Transformers (Right Side)
- Built-in transformers (@XML, @JSON, @CSV, @MD)
- User-defined @exec functions
- Imported functions

## Examples

### Multi-Step Pipeline
```mlld
/var @result = /run "cat data.json" | @json | @uppercase | @md
/show @result
```

### With Functions
```mlld
/exe @addHeader(content) = ::# Report
{{content}}::

/var @report = /run "cat stats.txt" | @addHeader | @md
/show @report
```

### JSON Processing
```mlld
/exe @extractName(data) = ::Name: {{data.user.name}}::

/var @info = /run "curl -s api.example.com/user" | @extractName
/show @info
```

## Alternative Syntax

The pipeline operator is syntactic sugar for the `with` clause:

```mlld
# These are equivalent:
/var @result1 = /run "echo hello" | @uppercase

/var @result2 = /run "echo hello" with { pipeline: [@uppercase] }
```

## Pipeline Format Feature

When using the `with` clause, you can specify how data should be parsed before being passed to pipeline functions:

```mlld
@data result = @getData() with { format: "json", pipeline: [@processData] }
```

### Available Formats

- **`json`** (default) - Parses as JSON, accessible via `input.data`
- **`csv`** - Parses as CSV, accessible via `input.csv` as 2D array
- **`xml`** - Converts JSON to XML or wraps text, accessible via `input.xml`
- **`text`** - Plain text, `input.data` returns raw text

### How It Works

Pipeline functions receive an input object with:
- `input.text` - Raw text (always available)
- `input.type` - Format type ("json", "csv", etc.)
- Format-specific property (parsed lazily when accessed)

### Example: JSON Format

```mlld
@exec getUsers() = run [(echo '[{"name":"Alice"},{"name":"Bob"}]')]

@exec processUsers(input) = js [(
  // Access parsed JSON via input.data
  const users = input.data;
  return users.map(u => u.name).join(', ');
)]

@data names = @getUsers() with { format: "json", pipeline: [@processUsers] }
@add @names  # Output: Alice, Bob
```

### Example: CSV Format

```mlld
@exec getCSV() = run [(echo 'name,age\nAlice,30\nBob,25')]

@exec processCSV(input) = js [(
  // Access as 2D array via input.csv
  const [headers, ...rows] = input.csv;
  return `${rows.length} records`;
)]

@data count = @getCSV() with { format: "csv", pipeline: [@processCSV] }
```

## Error Handling

Pipeline errors include context about which step failed:

```mlld
# Error will show "Pipeline step 2 failed"
@text data = run [(cat data.json)] | @invalidTransformer
```

## Best Practices

1. **Keep pipelines simple**: 2-3 steps is usually enough
2. **Use meaningful names**: Name your @exec functions clearly
3. **Handle errors early**: Validate data before transforming
4. **Test incrementally**: Build pipelines step by step

## See Also

- [Transformers](transformers.md) - Built-in transformation functions
- [Exec Commands](exec.md) - Creating reusable functions
- [With Clauses](with.md) - Advanced pipeline control