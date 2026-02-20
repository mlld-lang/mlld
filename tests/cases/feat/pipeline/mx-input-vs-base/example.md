/exe @source() = "seed"

/exe @validator(input, pipeline) = when [
  @pipeline.try < 3 => retry "hint!"
  * => `ok try=@pipeline.try base=@p[0] input=@mx.input last=@p[-1] hint=@mx.hint`
]

/var @result = @source() with { pipeline: [@validator(@p)] }
/show @result

