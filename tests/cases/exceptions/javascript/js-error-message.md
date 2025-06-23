# JavaScript Error Message Test

Tests that JavaScript errors preserve their original error messages.

## Example

```mlld
/exe @validate(data) = js {
  const parsed = JSON.parse(data);
  if (!parsed.name) {
  throw new Error("Invalid data: missing field 'name'");
  }
  return "Valid";
}

/var @result = @validate('{"age": 25}')
```

## Expected Error

JavaScript error: Invalid data: missing field 'name'