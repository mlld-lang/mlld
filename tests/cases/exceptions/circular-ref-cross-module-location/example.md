/import { @runSuites } from "./runner-cross.mld"

/exe @testFoo(s) = [
  let @inner = @runSuites([], @testFoo)
  => @s.name
]

/var @r = @runSuites([{ name: "first" }], @testFoo)
/show @r
