/exe @seed() = "s"

/exe @retryer(input, pipeline) = when [
  @pipeline.try < 3 => retry
  * => `done @pipeline.try`
]

/exe @downstream(input, pipeline) = `stageTry=@pipeline.try;tries=[@pipeline.tries]`

/var @result = @seed() with { pipeline: [@retryer(@p), @downstream(@p)] }
/show @result

