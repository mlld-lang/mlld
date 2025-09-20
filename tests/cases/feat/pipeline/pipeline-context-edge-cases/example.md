# Pipeline Context Edge Cases Test

/exe @singleStage(input, pipeline) = js {
  // @input is implicitly passed as first parameter
  // @p is explicitly passed as second parameter
  return `Stage: ${pipeline.stage}, Length: ${pipeline.length}
Zero: ${pipeline[0]}
Minus-1: ${pipeline[-1] || 'undefined'}
Minus-2: ${pipeline[-2] || 'undefined'}
Try: ${pipeline.try}
Input: ${input}`;
}

/exe @emptyPipelineStage(input, pipeline) = js {
  // @input is implicitly passed as first parameter
  return `Empty test - Stage: ${pipeline.stage}, Input: ${input}`;
}

# Test edge cases: single stage pipeline
/var @singleStageResult = "test-data"|@singleStage(@p)

Single Stage Result:

/show @singleStageResult