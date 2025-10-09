/exe @chunk(arr,sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @get_identifiers(e) = run { echo @e }

/var @data = '[[{"id": 1}, {"id": 2}], [30, 25], ["Alice", "Bob"]]' | @json
/var @chunked = @data | @chunk(2)

/var @result = foreach @get_identifiers(@chunked)
/show @result
