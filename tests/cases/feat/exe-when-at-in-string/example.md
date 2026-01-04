/exe @startsWithAt(s) = when first [
  @s.startsWith("@") => "yes"
  * => "no"
]

/var @result = @startsWithAt("@hello")
/show @result
