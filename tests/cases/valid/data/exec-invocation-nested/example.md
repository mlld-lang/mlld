/exe @getConfig = {echo '{"env":"prod","version":"2.0"}'}
/exe @transform(data) = sh {echo "$data" | sed "s/prod/production/g"}

/var @config = @getConfig()
/var @transformed = @transform(@config)
/var @config2 = @getConfig()
/var @nested = {
original: @config,
processed: @transformed,
array: [@config, @transformed]
}

/show [[Config: {{config}}]]
/show [[Transformed: {{transformed}}]]
/show [[Nested Original: {{nested.original}}]]
/show [[Nested Processed: {{nested.processed}}]]
/show [[Array: {{nested.array}}]]