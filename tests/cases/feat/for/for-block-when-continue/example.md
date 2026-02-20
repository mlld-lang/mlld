# For block with when continue

/var @items = ["apple", "banana", "cherry"]
/var @result = for @item in @items [
  when @item [
    "banana" => [continue]
  ]
  => @item
]
/show @result
