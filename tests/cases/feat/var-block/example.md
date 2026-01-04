/var @items = [1, 2]
/var @more = [3, 4]

/var @combined = [
  let @result = @items
  @result += @more
  => @result
]

/show @combined | @json
