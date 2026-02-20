# Guard op:cmd for exe command invocation

/guard @blockCmd before op:cmd = when [
  * => deny "Commands blocked"
]

/exe @test() = cmd { echo "hello" }
/show @test()
