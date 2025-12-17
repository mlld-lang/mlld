# Pipeline Inline Retry Replay Test

show attached to the source should replay once per attempt.

/exe @source() = js {
  // Return any value; attempts tracked via @mx.try in the pipeline
  return "payload";
}

/exe @retryHandler(input, pipeline) = when first [
  @pipeline.try < 3 => retry
  * => "done"
]

/var @result = @source() | show "Src attempt @mx.try" | @retryHandler(@p)

/show "Finished"

