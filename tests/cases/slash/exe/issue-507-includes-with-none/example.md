>> Alternative pattern using 'none' for fallback in when block
/exe @check(input) = when [
  @input.includes("illegal") => "YES"
  none => "NO"
]
/show @check("this has illegal in it")
