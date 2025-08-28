# Conditional Retry with Fallback Test

/exe @isValidJSON(input) = js {
  try { JSON.parse(input); return true; } catch { return false; }
}

/exe @jsonGenerator(input) = js {
  const attempts = [
    'not json at all',
    '{"incomplete": ',
    '{"valid": "json"}',
    '{"perfect": "json", "attempt": 4}'
  ];
  return attempts[ctx.try - 1] || '{"fallback": "json"}';
}

/exe @retryUntilValidJSON(input, pipeline) = when first [
  @isValidJSON(@input) => @input
  @pipeline.try < 4 => retry
  * => "fallback: using default JSON structure"
]

# Create a retryable source
/exe @getSeed() = "seed-data"

# Test conditional retry with fallback after max attempts
/var @result = @getSeed() with { pipeline: [@jsonGenerator, @retryUntilValidJSON(@p), js { return `valid-json: ${@input}` }] }

/show @result
