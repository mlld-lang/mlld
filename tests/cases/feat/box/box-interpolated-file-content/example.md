/var @name = "World"
/var @template = `Hello, @name!`

/var @box-ifc = box [
  file "greeting.txt" = @template
  let @r = run cmd { cat greeting.txt }
  => @r
]
/show @box-ifc