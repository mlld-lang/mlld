# Multi-Parameter JSON Test

Tests that multi-parameter functions automatically destructure JSON objects.

## Example

```mlld
/exe @greet(name, title) = ::Hello {{title}} {{name}}!::
/var @result = run {echo '{"name": "Smith", "title": "Dr."}'} | @greet
/show @result
```

## Expected

Hello Dr. Smith!