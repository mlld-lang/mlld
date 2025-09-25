# JSON Formatting Preservation from Shell Scripts

Test that JSON output from shell scripts preserves its original formatting.

## Simple object - should preserve pretty printing from shell

{
  "name": "Alice"
}

## Complex object - should remain pretty printed


{
  "name": "Alice",
  "details": {
    "age": 30,
    "items": ["apple", "banana"]
  }
}

## Minified object - should remain minified

{"name":"Bob"}

## Empty object - formatting should be preserved

{

}