/var @items = ["apple", "banana", "cherry", "date"]

/var @filtered = for @item in @items when @item.startsWith("b") || @item.startsWith("c") => @item
/show @filtered | @json
