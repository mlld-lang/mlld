# Test: Nested field access when iterating over JSON array file

JSON files containing arrays should iterate over the array elements,
and nested field access should work on each element.

## Block syntax with nested access
alice: NYC
bob: LA

## Arrow syntax with nested access

Cities: ["NYC","LA"]
## Deeply nested access

Ages: [30,25]
