/var @items = ["A", "B", "C"]

/exe @processItem(item) = `
Item: @item

<parallel-stack-shared.md>
`

/var @results = for parallel(3) @item in @items => @processItem(@item)

/show @results
