# For block with if continue

/var @nums = [1, 2, 3, 4, 5]
/var @result = for @n in @nums [
  if @n % 2 == 0 [continue]
  => @n
]
/show @result
