/exec getConfig = {echo '{"env":"prod","version":"2.0"}'}
/exec @transform(data) = sh {echo "$data" | sed "s/prod/production/g"}

/data @config = @getConfig()
/data @transformed = @transform(@config)
/data @config2 = @getConfig()
/data @nested = {
  original: @config,
  processed: @transformed,
  array: [@config, @transformed]
}

/add [[Config: {{config}}]]
/add [[Transformed: {{transformed}}]]
/add [[Nested Original: {{nested.original}}]]
/add [[Nested Processed: {{nested.processed}}]]
/add [[Array: {{nested.array}}]]