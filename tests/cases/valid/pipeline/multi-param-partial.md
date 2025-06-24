# Multi-Parameter Partial JSON Test

Tests that JSON with missing fields provides empty strings for missing parameters.

## Example

```mlld
/exe @format(first, middle, last) = [[Name: {{first}} {{middle}} {{last}}]]
/var @result = run {echo '{"first": "John", "last": "Doe"}'} | @format
/show @result
```

## Expected

Name: John  Doe