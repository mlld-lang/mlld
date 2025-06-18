# Multi-Parameter JSON Test

Tests that multi-parameter functions automatically destructure JSON objects.

## Example

```mlld
@exec greet(name, title) = [[Hello {{title}} {{name}}!]]
@text result = @run [(echo '{"name": "Smith", "title": "Dr."}')] | @greet
@add @result
```

## Expected

Hello Dr. Smith!