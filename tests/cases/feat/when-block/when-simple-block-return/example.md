/var @active = true
/var @result = when @active [
  let @x = "computed"
  let @y = " value"
  => `@x@y`
]
/show @result
