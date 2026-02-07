# For block with when done

/var @items = ["apple", "banana", "cherry"]
/var @result = for @item in @items [
  when @item [
    "banana" => [done]
  ]
  => @item
]
/show @result
