/var @items = ["a", "b", "c"]

/exe @testJoin(arr) = [
  let @lines = for @x in @arr => `- @x`
  let @joined = @lines.join("\n")
  => @joined
]

/var @result = @testJoin(@items)
/show @result
