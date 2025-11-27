>> Alternative pattern using 'none' for fallback in bare when
/exe @check(input) = when [
  @input.includes("illegal") => "YES"
  none => "NO"
]
/show @check("this has illegal in it")
