# Test: JSON transformer basic formatting

## Format existing JSON

{
  "name": "Alice",
  "age": 30,
  "city": "NYC"
}
## Convert markdown to JSON

{
  "name": "Alice",
  "age": "30",
  "city": "NYC"
}
## Chain with other transformers

{
  "items": [
    1,
    2,
    3
  ]
}
