# For block with if done

/var @nums = [1, 2, 3, 4, 5]
/var @result = for @n in @nums [
  if @n > 3 [done]
  => @n
]
/show @result
