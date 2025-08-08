# Conditional Retry with Fallback Test

/exe @validateJSON(input) = js {
  try {
    JSON.parse(input);
    return `valid-json: ${input}`;
  } catch {
    return `invalid-json: ${input}`;
  }
}

/exe @jsonGenerator(input, attempt) = js {
  const attempts = [
    'not json at all',
    '{"incomplete": ',
    '{"valid": "json"}',
    '{"perfect": "json", "attempt": 4}'
  ];
  return attempts[attempt - 1] || '{"fallback": "json"}';
}

/exe @retryUntilValidJSON(input) = when: [
  @input.includes("valid-json") => @input
  @pipeline.try < 4 => retry
  * => "fallback: using default JSON structure"
]

# Test conditional retry with fallback after max attempts
/var @result = "seed-data" with { pipeline: [@jsonGenerator(@p.try), @validateJSON, @retryUntilValidJSON] }

/show @result