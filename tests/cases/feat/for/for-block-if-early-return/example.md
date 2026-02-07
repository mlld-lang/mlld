# For block with if early return

/var @nums = [1, 2, 3, 4, 5]
/var @result = for @n in @nums [
  if @n > 3 [=> "big"]
  => "small"
]
/show @result
