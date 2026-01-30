/exe @gen(input) = `gen-@mx.try:@input`

 /exe @retryPrev(input) = when [
  @mx.try < 3 => retry
  * => `done try=@mx.try`
]

/exe @seed() = "seed"

# Pipe syntax with retrier (retries previous stage, not stage 0)
/show @seed() | @gen | @retryPrev

# With-clause syntax with retrier (same behavior)
/var @tmp = @seed() with { pipeline: [@gen, @retryPrev] }
/show @tmp
