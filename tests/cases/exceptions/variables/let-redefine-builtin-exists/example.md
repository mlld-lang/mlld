/exe @test() = [
  let @exists = "hello"
  => @exists
]
/var @r = @test()
/show @r
