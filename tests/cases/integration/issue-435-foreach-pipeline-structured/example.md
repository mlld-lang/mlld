/exe @zipAs(entries, values, fieldName) = js {
  const unwrap = value => (value && typeof value === 'object' && value.data !== undefined ? value.data : value);
  const base = entries && typeof entries === 'object' && entries.data !== undefined ? entries.data : entries;
  const incoming = values && typeof values === 'object' && values.data !== undefined ? values.data : values;
  console.log('[issue-435][zipAs] raw entries:', entries);
  console.log('[issue-435][zipAs] raw values:', values);
  console.log('[issue-435][zipAs] normalized base:', base);
  console.log('[issue-435][zipAs] normalized incoming:', incoming);
  return base.map((entry, i) => {
    const obj = { ...entry };
    obj[fieldName] = unwrap(incoming[i]);
    console.log('[issue-435][zipAs] iteration', i, {
      entry,
      incomingValue: incoming[i],
      unwrapped: unwrap(incoming[i]),
      fieldName
    });
    return obj;
  });
}

/exe @square(arr) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][square] raw arr:', arr);
  console.log('[issue-435][square] normalized list:', list);
  return list.map(value => {
    const numeric = value && typeof value === 'object' && value.data !== undefined ? value.data : value;
    console.log('[issue-435][square] value to numeric:', { value, numeric });
    return numeric * numeric;
  });
}

/exe @flat(arr) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][flat] raw arr:', arr);
  console.log('[issue-435][flat] normalized list:', list);
  return list.flat();
}

/var @data = '[{"f":1}, {"f":2}, {"f":3}, {"f":4}]' | @json
/var @chunks = '[[1, 2], [3, 4]]' | @json
/var @squared = foreach @square(@chunks)
/var @ids = @squared | @flat
/var @result = @zipAs(@data, @ids, "id")
/show @result
