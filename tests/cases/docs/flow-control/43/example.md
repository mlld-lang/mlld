>> Multi-source fetch with repair
/exe @aggregate(sources) = [
  let @data = || @fetch(@sources[0]) || @fetch(@sources[1]) || @fetch(@sources[2])
  => when [
    @ctx.errors.length == 0 => @data
    @data.length >= 2 => @data  << 2/3 is good enough
    * => retry `Need at least 2 sources. Failed: @ctx.errors`
  ]
]