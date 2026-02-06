/exe @check(x) = [
  when !@x => [=> "missing"]
  => "ok: @x"
]
/show @check(null)
/show @check("hello")
