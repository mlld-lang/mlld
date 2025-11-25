/guard @first before secret = when [
  * => allow @input.trim()
]

/guard @second before secret = when [
  * => allow `safe:@input`
]

/var secret @data = "  hello  "
/exe @deliver(v) = `Result: @v`

>> Result: safe:hello
/show @deliver(@data)