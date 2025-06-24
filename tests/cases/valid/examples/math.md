/var @items = [
  { "name": "Item 1", "value": 100 },
  { "name": "Item 2", "value": 200 },
  { "name": "Item 3", "value": 300 }
]

/var @total = run {echo "@items.0.value + @items.1.value + @items.2.value" | bc}

/show @total