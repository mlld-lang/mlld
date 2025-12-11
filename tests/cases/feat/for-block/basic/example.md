/exe @countAndShow(items) = [
  let @count = 0
  for @item in @items [
    show "Item: @item"
    let @count += 1
  ]
  => @count
]

/var @items = ["a", "b", "c"]

/show "Total: @countAndShow(@items)"
