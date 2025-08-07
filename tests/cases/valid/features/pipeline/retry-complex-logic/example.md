# Complex Retry Logic Test

/exe @qualityScorer(input, attempt) = js {
  // Generate different scores based on attempt
  const scores = [0.2, 0.6, 0.9, 0.95, 0.85];
  const score = scores[attempt - 1] || 0.8;
  return `score:${score}:${input}`;
}

/exe @bestOfAttempts(input, tries) = js {
  const attempts = tries || [];
  if (attempts.length === 0) return input;
  
  // Extract scores and find best attempt
  const withScores = attempts.map((attempt, i) => {
    const scoreMatch = attempt.match(/score:([\d.]+):/);
    return {
      attempt,
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      index: i
    };
  });
  
  const best = withScores.reduce((best, current) => 
    current.score > best.score ? current : best);
  
  return `best: ${best.attempt} (from ${attempts.length} attempts)`;
}

/exe @adaptiveRetry(input) = when: [
  @input.includes("score:0.9") => @input
  @input.includes("score:0.8") => @input
  @pipeline.try < 5 => retry
  * => @bestOfAttempts(@input, @pipeline.tries)
]

# Test complex retry logic with attempt selection
/var @result = "test-data"|@qualityScorer(@p.try)|@adaptiveRetry

/show @result