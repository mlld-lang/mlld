/exe @randomQuality(input) = js {
  const values = [0.3, 0.7, 0.95, 0.2, 0.85];
  return values[ctx.try - 1] || 0.1;
}

/exe @validateQuality(score) = when first [
  @score > 0.9 => `excellent: @score`
  @score > 0.8 => `good: @score`
  @ctx.try < 5 => retry
  none => `failed: best was @score`
]

/var @result = @randomQuality | @validateQuality
/show @result