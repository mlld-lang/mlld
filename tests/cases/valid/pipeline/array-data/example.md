@exec getItems() = js [(
  JSON.stringify([
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' }
  ])
)]

@exec showData(x) = js [(String(x).substring(0, 100))]

# Direct call (should work)
@data direct = @showData(@getItems())
@add [[Direct: {{direct}}]]

# Pipeline (should now also work)  
@data piped = @getItems() | @showData
@add [[Piped: {{piped}}]]