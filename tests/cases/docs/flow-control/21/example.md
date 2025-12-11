/exe @invokeAll(agents, msg) = [
  let @results = for parallel @a in @agents => @invoke(@a, @msg)
  => when [
    @ctx.errors.length == 0 => @results
    @results.length >= 2 => @results  << 2/3 succeeded is acceptable
    * => @repair(@results, @ctx.errors, @msg)  << AI-driven repair
  ]
]