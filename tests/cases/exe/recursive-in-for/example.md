/exe @lte1(n)   = js { return n <= 1 }
/exe @dec(n)    = js { return n - 1 }
/exe @mul(a, b) = js { return a * b }
/exe recursive @fact(n) = [
  when @lte1(@n) => 1
  let @prev = @dec(@n)
  let @rest = @fact(@prev)
  => @mul(@n, @rest)
]

/var @inputs = [1, 2, 3, 4, 5]
/var @results = for @n in @inputs => @fact(@n)
/show @results
