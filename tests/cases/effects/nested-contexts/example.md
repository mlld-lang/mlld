# Nested Contexts Effects Test

Testing effects in deeply nested contexts (for-in-exe-in-when)

/exe @processItem(item) = when [
  @item == "apple" => "First: @item"
  @item == "cherry" => "Last: @item"
  * => "Middle: @item"
]

/var @items = ["apple", "banana", "cherry"]

/for @item in @items => show @processItem(@item)