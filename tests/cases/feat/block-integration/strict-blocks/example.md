exe @process(items) = [
  let @results = []

  for @item in @items [
    let @results += @item.value
    show "Processed: @item.id"
  ]

  => @results
]

var @output = @process([
  { id: 1, value: "a" },
  { id: 2, value: "b" }
])

show @output | @json
