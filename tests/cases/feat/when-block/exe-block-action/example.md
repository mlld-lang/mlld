/var @x = true
/var @result = when first [
  @x => [
    let @y = "hello"
    => @y
  ]
  * => "fallback"
]
/show @result
