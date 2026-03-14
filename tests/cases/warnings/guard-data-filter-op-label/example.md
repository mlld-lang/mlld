/exe tool:w @mytool(x) = [
  => @x
]

/guard before op:tool:w = when [
  * => allow
]

/guard @second before tool:w = when [
  * => allow
]

/show @mytool("hello")
