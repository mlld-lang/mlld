# Arithmetic in let assignments

/exe @calculate(x, y) = [
  let @product = @x * @y
  let @doubled = @product * 2
  => @doubled
]

/show @calculate(4, 5)
