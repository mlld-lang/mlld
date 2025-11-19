/exe network @stageOne(value) = `stage-one:@value`
/exe destructive @stageTwo(value) = `stage-two:@value`
/exe @inspect(value) = `stage0:@pipeline[0].ctx.labels stage1:@pipeline[1].ctx.labels stage2:@pipeline[2].ctx.labels`

/var secret @seed = "pipeline-input"
/var @summary = @seed | @stageOne | @stageTwo | @inspect
/show @summary
