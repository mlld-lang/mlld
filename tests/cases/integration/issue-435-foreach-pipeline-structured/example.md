/exe @zipAs(entries, values, fieldName) = js {
  const base = entries;
  const incoming = values;
  console.log('[issue-435][zipAs] entries:', entries);
  console.log('[issue-435][zipAs] values:', values);
  return base.map((entry, i) => {
    const obj = { ...entry };
    obj[fieldName] = incoming[i];
    console.log('[issue-435][zipAs] iteration', i, {
      entry,
      incomingValue: incoming[i],
      fieldName
    });
    return obj;
  });
}

/exe @square(arr) = js {
  console.log('[issue-435][square] arr:', arr);
  return arr.map(value => {
    console.log('[issue-435][square] value:', value);
    return value * value;
  });
}

/exe @flat(arr) = js {
  console.log('[issue-435][flat] arr:', arr);
  return arr.flat();
}

/var @data = '[{"f":1}, {"f":2}, {"f":3}, {"f":4}]' | @json
/var @chunks = '[[1, 2], [3, 4]]' | @json
/var @squared = foreach @square(@chunks)
/var @ids = @squared | @flat
/var @result = @zipAs(@data, @ids, "id")
/show @result
