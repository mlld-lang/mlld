/exe @source() = "seed"

/exe @validator(input, pipeline) = when first [
  @pipeline.try < 3 => retry "hint!"
  * => `ok try=@pipeline.try base=@p[0] input=@ctx.input last=@p[-1] hint=@ctx.hint`
]

/var @result = @source() with { pipeline: [@validator(@p)] }
/show @result

