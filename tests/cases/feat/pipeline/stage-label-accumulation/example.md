/exe network @stageOne(value) = `stage-one:@value`
/exe destructive @stageTwo(value) = `stage-two:@value`
/exe @inspect(value) = `stage0:@pipeline[0].mx.labels stage1:@pipeline[1].mx.labels stage2:@pipeline[2].mx.labels`

/var secret @seed = "pipeline-input"
/var @summary = @seed | @stageOne | @stageTwo | @inspect
/show @summary
