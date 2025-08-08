# Pipeline Context Preservation Test

/exe @addMetadata(input) = js {
  return `meta: ${input}`;
}

/exe @contextChecker(input, pipeline) = js {
  return `Input: ${input}
Original: ${pipeline[0]}
Meta: ${pipeline[1]}
Previous: ${pipeline[-1]}
Stage: ${pipeline.stage}
Length: ${pipeline.length}
Try: ${pipeline.try}`;
}

/exe @retryOnce(input) = when: [
  @pipeline.try >= 2 => @input
  * => retry
]

/exe @finalCheck(input, pipeline) = js {
  return `Final check - Stage ${pipeline.stage}, Length ${pipeline.length}
Original input: ${pipeline[0]}
All stages: [${Array.from({length: pipeline.length}, (_, i) => pipeline[i + 1]).join(', ')}]
Current: ${input}`;
}

# Test that pipeline context is preserved across all stages including retries
/var @result = "original-data"|@addMetadata|@contextChecker(@p)|@retryOnce|@finalCheck(@p)

/show @result