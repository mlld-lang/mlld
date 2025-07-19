# Test: Chaining transformers

## JSON to CSV pipeline
/var @jsonData = `
[
  {"product": "Laptop", "price": 999, "stock": 15},
  {"product": "Mouse", "price": 25, "stock": 50},
  {"product": "Keyboard", "price": 75, "stock": 30}
]
`

/var @report = run {echo "@jsonData"} with { pipeline: [@json, @csv] }
/show @report

## Multiple transformations
/var @mdData = `
# Products
- Laptop: $999
- Mouse: $25
- Keyboard: $75
`

/var @xmlReport = run {echo "@mdData"} with { pipeline: [@md, @xml] }
/show @xmlReport