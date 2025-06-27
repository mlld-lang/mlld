# Multi-Parameter Text Fallback Test

Tests that multi-parameter functions fall back to passing text as first parameter when input is not JSON.

## Example

```mlld
/exe @greet(name, title) = ::Hello {{title}} {{name}}!::
/var @result = run {echo "Smith"} | @greet
/show @result
```

## Expected

Hello  Smith!