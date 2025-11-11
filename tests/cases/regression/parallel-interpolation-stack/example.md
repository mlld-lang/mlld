/var @items = ["A", "B", "C"]

/exe @processItem(item) = `
Item: @item

<parallel-stack-shared.md>
`

/var @results = for 3 parallel @item in @items => @processItem(@item)

/show @results
