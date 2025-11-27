>> Test that .includes() works correctly on parameters in when conditions
>> Using 'when first' for switch semantics (stop at first match)
/exe @check(input) = when first [
  @input.includes("illegal") => "YES"
  * => "NO"
]
/show @check("this has illegal in it")
