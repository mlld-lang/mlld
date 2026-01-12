/exe @test(value) = [
  when @value == 2 [
    show "value is two!"
  ]
  => "done"
]
/show @test(1)
/show @test(2)
/show @test(3)
