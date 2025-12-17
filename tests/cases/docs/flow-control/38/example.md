/exe @process(state) = when [
  @mx.while.iteration > 5 => done @state
  @mx.while.iteration == @mx.while.limit => done "hit cap"
  * => continue @state
]