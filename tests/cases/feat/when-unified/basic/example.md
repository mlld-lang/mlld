/exe @classify(x) = when [
  @x > 100 => "large"
  @x > 10 => "medium"
  * => "small"
]

/show @classify(150)
/show @classify(50)
/show @classify(5)
