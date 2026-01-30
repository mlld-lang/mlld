/exe @startsWithAt(s) = when [
  @s.startsWith("@") => "yes"
  * => "no"
]

/var @result = @startsWithAt("@hello")
/show @result
