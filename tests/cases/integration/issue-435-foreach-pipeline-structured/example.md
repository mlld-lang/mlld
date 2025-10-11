/exe @zipAs(entries,values,fieldName) = js {
  return entries.map((entry, i) => {
    const obj = {...entry}
    obj[fieldName] = values[i];
    return obj;
  });
}

/exe @square(arr) = js {
  return arr.map(x => x * x);
}

/exe @flat(arr) = js {
  return arr.flat()
}

/var @data = '[{"f":1}, {"f":2}, {"f":3}, {"f":4}]' | @json
/var @chunks = '[[1, 2], [3, 4]]' | @json
/var @squared = foreach @square(@chunks)
/var @ids = @squared | @flat
/var @result = @zipAs(@data, @ids, "id")
/show @result
