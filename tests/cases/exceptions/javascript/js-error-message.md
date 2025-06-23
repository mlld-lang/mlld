# JavaScript Error Message Test

Tests that JavaScript errors preserve their original error messages.

## Example

```mlld
/exec @validate(data) = js {
  const parsed = JSON.parse(data);
  if (!parsed.name) {
  throw new Error("Invalid data: missing field 'name'");
  }
  return "Valid";
}

/text @result = @validate('{"age": 25}')
```

## Expected Error

JavaScript error: Invalid data: missing field 'name'