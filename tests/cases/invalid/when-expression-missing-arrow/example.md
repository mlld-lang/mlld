---
description: Deprecated when expression syntax missing arrow in exe RHS
---

/exe @test(x) = [
  when @x [
    let @y = 1
    => @y
  ]
  => null
]
/show @test(true)
