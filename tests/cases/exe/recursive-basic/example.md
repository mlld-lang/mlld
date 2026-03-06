exe @isBase(n) = js { return n <= 1 }
exe @dec(n)    = js { return n - 1 }
exe @mul(a, b) = js { return a * b }

exe recursive @fact(n) = [
  when @isBase(@n) => 1
  let @prev = @dec(@n)
  let @rest = @fact(@prev)
  => @mul(@n, @rest)
]
show @fact(5)
