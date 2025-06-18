# Test: CSV transformer

## Convert JSON array to CSV
@text jsonData = [[
[
  {"name": "Alice", "age": 30, "city": "NYC"},
  {"name": "Bob", "age": 25, "city": "LA"},
  {"name": "Charlie", "age": 35, "city": "Chicago"}
]
]]

@text csvResult = @run [(echo '@jsonData')] | @csv
@add @csvResult

## Convert markdown table to CSV
@text mdTable = [[
| Name | Age | City |
|------|-----|------|
| Alice | 30 | NYC |
| Bob | 25 | LA |
]]

@text csvTable = @run [(echo "@mdTable")] | @CSV
@add @csvTable