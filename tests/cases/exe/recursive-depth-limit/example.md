exe @inc(n) = js { return n + 1 }
exe recursive @inf(n) = [
  let @next = @inc(@n)
  => @inf(@next)
]
show @inf(0)
