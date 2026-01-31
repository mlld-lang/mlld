/var @count = 3
/when @count > 0 => [
  let @items = []
  @items += "first"
  @items += "second"
  @items += "third"
  for @item in @items => show @item
]
