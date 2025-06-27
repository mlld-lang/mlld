# Test: CSV transformer

## Convert JSON array to CSV
/var @jsonData = ::
[
  {"name": "Alice", "age": 30, "city": "NYC"},
  {"name": "Bob", "age": 25, "city": "LA"},
  {"name": "Charlie", "age": 35, "city": "Chicago"}
]
::

/var @csvResult = run {echo "@jsonData"} with { pipeline: [@csv] }
/show @csvResult

## Convert markdown table to CSV
/var @mdTable = ::
| Name | Age | City |
|------|-----|------|
| Alice | 30 | NYC |
| Bob | 25 | LA |
::

/var @csvTable = run {echo "@mdTable"} with { pipeline: [@CSV] }
/show @csvTable