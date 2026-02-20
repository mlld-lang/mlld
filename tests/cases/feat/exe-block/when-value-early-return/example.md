/exe @guard(x) = [
  when !@x => "missing"
  => "ok: @x"
]
/show @guard(null)
/show @guard("hello")
