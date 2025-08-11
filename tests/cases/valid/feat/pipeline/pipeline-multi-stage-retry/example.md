# Multi-Stage Retry Test

/exe @stageOne(input) = `s1-try@pipeline.try: @input`

/exe @retryStageOne(input) = when: [
  @pipeline.try >= 2 => @input
  * => retry
]

/exe @stageTwo(input) = `s2-try@pipeline.try: @input`

/exe @retryStageTwo(input) = when: [
  @pipeline.try >= 3 => @input
  * => retry
]

/exe @finalStage(input) = `final: @input (stage @pipeline.stage)`

# Create a retryable source
/exe @getInitial() = "initial"

# Test retry behavior across multiple pipeline stages
/var @result = @getInitial()|@stageOne|@retryStageOne|@stageTwo|@retryStageTwo|@finalStage

/show @result