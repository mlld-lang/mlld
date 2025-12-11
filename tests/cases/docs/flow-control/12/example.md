/exe @countItems(items) = [
  let @count = 0
  for @item in @items [
    let @count += 1
  ]
  => @count
]

/show @countItems(["a", "b", "c"])