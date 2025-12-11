/exe @combine(a, b) = [
  let @result = "@a-@b"
  => @result
]

/show @combine("hello", "world")