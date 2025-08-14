# Pipeline Retry with None Fallback

## Setup test functions
/exe @randomQuality(input, pipeline) = js {
  const values = [0.3, 0.7, 0.95, 0.2, 0.85];
  return values[pipeline.try - 1] || 0.1;
}

/exe @validateQuality(score, pipeline) = when first [
  @score > 0.9 => `excellent: @score`
  @score > 0.8 => `good: @score`
  @pipeline.try < 5 => retry
  none => `failed: best was @score`
]

## Test retry with none as ultimate fallback
/var @seed = "start"
/var @result = @seed with { pipeline: [@randomQuality, @validateQuality] }
/show @result

## Test immediate success (no retry, none doesn't execute)
/exe @alwaysGood(input, pipeline) = js { return 0.92; }
/var @good = "test" with { pipeline: [@alwaysGood, @validateQuality] }
/show @good

## Multiple stage retry with none
/exe @stage1(input, pipeline) = when first [
  @pipeline.try == 3 => "stage1-ok"
  @pipeline.try < 3 => retry
  none => "stage1-failed"
]

/exe @stage2(input, pipeline) = when first [
  @input == "stage1-ok" && @pipeline.try == 2 => "stage2-ok"
  @input == "stage1-ok" && @pipeline.try < 2 => retry
  none => `stage2-failed: @input`
]

/exe @stage3(input) = when first [
  @input == "stage2-ok" => "pipeline complete!"
  none => `pipeline failed at: @input`
]

/var @multi = "init" with { pipeline: [@stage1, @stage2, @stage3] }
/show @multi