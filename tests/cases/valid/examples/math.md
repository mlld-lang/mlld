/data @items = [
  { "name": "Item 1", "value": 100 },
  { "name": "Item 2", "value": 200 },
  { "name": "Item 3", "value": 300 }
]

/text @total = @run {echo "@items.0.value + @items.1.value + @items.2.value" | bc}

/add @total