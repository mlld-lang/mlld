/exe @process(items) = [
  let @total = 0

  for @item in @items [
    let @total += @item.points
    show "Item @item.name: @item.points"
  ]

  => @total
]

/var @items = [
  { name: "One", points: 2 },
  { name: "Two", points: 3 }
]

/show "Total points: @process(@items)"
