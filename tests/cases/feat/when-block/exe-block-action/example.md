/var @x = true
/var @result = when [
  @x => [
    let @y = "hello"
    => @y
  ]
  * => "fallback"
]
/show @result
