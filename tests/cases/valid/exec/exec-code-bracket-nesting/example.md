# Test: Bracket Nesting in Exec Code Blocks

Test exec commands with complex bracket nesting scenarios.

@exec process_data(items) = @run [(python 
data = [
  {"name": "item1", "values": [1, 2, 3)]},
  {"name": "item2", "values": [4, 5, 6]}
]
filtered = [item for item in data if item['name'] in items]
for item in filtered:
  print(f"{item['name']}: {item['values']}")

@run @process_data(['item1', 'item2'])