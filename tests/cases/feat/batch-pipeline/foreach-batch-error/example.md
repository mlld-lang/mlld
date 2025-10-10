/exe @get(items) = js {
  return items;
}
/exe @fail(text) = js {
  throw new Error('batch failed');
}

/var @values = [1, 2]
/var @result = foreach @get(@values) => | @fail
/show @result
