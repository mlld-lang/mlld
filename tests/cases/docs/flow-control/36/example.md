/exe @process(state) = when [
  @ctx.while.iteration > 5 => done @state
  @ctx.while.iteration == @ctx.while.limit => done "hit cap"
  * => continue @state
]