# For block with let and +=

/var @items = []

/for @item in ["a", "b", "c"] [
  show "Item: @item"
  let @items += @item
]

/var @total = @items.length

/show "Total: @total"
