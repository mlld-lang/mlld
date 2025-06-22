# Multi-Parameter Text Fallback Test

Tests that multi-parameter functions fall back to passing text as first parameter when input is not JSON.

## Example

```mlld
@exec greet(name, title) = [[Hello {{title}} {{name}}!]]
@text result = @run [(echo "Smith")] | @greet
@add @result
```

## Expected

Hello  Smith!