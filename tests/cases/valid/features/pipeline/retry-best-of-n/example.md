# Best-of-N Retry Pattern Test

/exe @generateVariation(input, pipeline) = js {
  const variations = [
    "variation-poor",
    "variation-good", 
    "variation-excellent",
    "variation-perfect",
    "variation-outstanding"
  ];
  return variations[pipeline.try - 1] || "variation-unknown";
}

/exe @selectBest(input, pipeline) = js {
  const attempts = pipeline.tries || [];
  if (attempts.length === 0) return input;
  
  const quality = {
    "variation-poor": 1,
    "variation-good": 2,
    "variation-excellent": 3,
    "variation-perfect": 4,
    "variation-outstanding": 5
  };
  
  const best = attempts.reduce((best, attempt) => 
    quality[attempt] > quality[best] ? attempt : best);
  
  return `selected: ${best} from [${attempts.join(', ')}]`;
}

/exe @collectFiveAttempts(input) = when: [
  @pipeline.try < 5 => retry
  * => @selectBest(@input, @p)
]

# Test best-of-N pattern: generate 5 variations and select the best
/var @result = "prompt"|@generateVariation(@p)|@collectFiveAttempts

/show @result