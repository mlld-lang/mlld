# Test: Chaining transformers

## JSON to CSV pipeline
@text jsonData = [[
[
  {"product": "Laptop", "price": 999, "stock": 15},
  {"product": "Mouse", "price": 25, "stock": 50},
  {"product": "Keyboard", "price": 75, "stock": 30}
]
]]

@text report = @run [(echo '@jsonData')] | @json | @csv
@add @report

## Multiple transformations
@text mdData = [[
# Products
- Laptop: $999
- Mouse: $25
- Keyboard: $75
]]

@text xmlReport = @run [(echo "@mdData")] | @md | @xml
@add @xmlReport