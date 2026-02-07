# For block with when early return unwrap

/var @items = ["apple", "banana", "cherry"]
/var @result = for @item in @items [
  when @item [
    "apple" => [=> "fruit-a"]
    "banana" => [=> "fruit-b"]
    none => [=> "fruit-other"]
  ]
]
/show @result
