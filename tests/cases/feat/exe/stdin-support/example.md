/exe @filterActive(data) = js {
  // data is already parsed by @json transformer
  const items = typeof data === 'string' ? JSON.parse(data) : data;
  return items.filter(item => item.active === true);
}

/exe @processWithStdin(data) = run { cat } with { stdin: @data, pipeline: [@filterActive] }

/exe @processWithPipe(data) = run @data | { cat } | @filterActive

/var @jsonData = '[{"name": "Alice", "active": true}, {"name": "Bob", "active": false}]'

/var @result1 = @processWithStdin(@jsonData)
/var @result2 = @processWithPipe(@jsonData)

/show @result1
/show @result2