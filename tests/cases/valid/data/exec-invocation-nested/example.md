@exec getConfig = [(echo '{"env":"prod","version":"2.0"}')]
@exec transform(data) = [(echo "{{data}}" | sed 's/prod/production/g')]

@data config = @getConfig()
@data transformed = @transform(@config)
@data nested = {
  original: @getConfig(),
  processed: @transform(@getConfig()),
  array: [@getConfig(), @transform(@config)]
}

@add [[Config: {{config}}]]
@add [[Transformed: {{transformed}}]]
@add [[Nested Original: {{nested.original}}]]
@add [[Nested Processed: {{nested.processed}}]]
@add [[Array Length: {{nested.array.length}}]]