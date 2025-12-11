# Arithmetic in exe blocks

/exe @add(a, b) = [
  let @sum = @a + @b
  => @sum
]

/show @add(5, 3)
