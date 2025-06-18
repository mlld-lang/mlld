# Multi-Parameter Partial JSON Test

Tests that JSON with missing fields provides empty strings for missing parameters.

## Example

```mlld
@exec format(first, middle, last) = [[Name: {{first}} {{middle}} {{last}}]]
@text result = @run [(echo '{"first": "John", "last": "Doe"}')] | @format
@add @result
```

## Expected

Name: John  Doe