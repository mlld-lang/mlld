# Single Parameter Test

Tests that single parameter functions continue working as before.

## Example

```mlld
/exe @uppercase(text) = js {text.toUpperCase()}
/var @result = @run {echo "hello world"} | @uppercase
/show @result
  ```

## Expected

HELLO WORLD