/exe @seed() = "base"

/exe @gen(input, pipeline) = `v-@pipeline.try: @input`

/exe @retry2(input, pipeline) = when first [
  @pipeline.try < 3 => retry
  * => @input
]

/exe @id(input) = `@input`

/exe @retry3(input, pipeline) = when first [
  @pipeline.try < 2 => retry
  * => @input
]

/exe @emitAll(input, pipeline) = js {
  const all = pipeline.retries.all || [];
  const sizes = all.map(a => a.length);
  return `contexts:${all.length};sizes:${sizes.join(',')}`;
}

/var @result = @seed() with { pipeline: [@gen(@p), @retry2(@p), @id, @retry3(@p), @emitAll(@p)] }
/show @result
