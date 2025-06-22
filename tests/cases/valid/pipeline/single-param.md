# Single Parameter Test

Tests that single parameter functions continue working as before.

## Example

```mlld
/exec @uppercase(text) = js {text.toUpperCase()}
/text @result = @run {echo "hello world"} | @uppercase
/add @result
```

## Expected

HELLO WORLD