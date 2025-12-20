/exe @collectArray() = when [
  let @items = []
  @items += "a"
  @items += "b"
  @items += ["c", "d"]
  * => @items
]
/show @collectArray() | @json

/exe @buildString() = when [
  let @msg = "Hello"
  @msg += " "
  @msg += "World"
  * => @msg
]
/show @buildString()

/exe @mergeObjects() = when [
  let @obj = {"a": 1}
  @obj += {"b": 2}
  @obj += {"c": 3}
  * => @obj
]
/show @mergeObjects() | @json

/exe @concat(a, b) = [
  let @result = @a
  @result += @b
  => @result
]
/show @concat([1, 2], [3, 4]) | @json
