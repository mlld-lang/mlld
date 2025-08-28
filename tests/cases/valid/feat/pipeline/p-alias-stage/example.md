/exe @seed() = "x"

/exe @emit(input, pipeline) = `p=@p.stage pipeline=@pipeline.stage`

/var @result = @seed() with { pipeline: [@emit(@p)] }
/show @result

