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

/exe @onlySome(array) = for @item in @array => when [
    @item.file < 5 => @item
    none => skip
  ]

/exe @truncateTo(arr, max) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][truncateTo] raw arr:', arr);
  console.log('[issue-435][truncateTo] normalized list:', list);
  console.log('[issue-435][truncateTo] max:', max);
  return list.slice(0, max);
}

/exe @chunk(arr, sz) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][chunk] raw arr:', arr);
  console.log('[issue-435][chunk] normalized list:', list);
  console.log('[issue-435][chunk] size:', sz);
  return Array.from(
    { length: Math.ceil(list.length / sz) },
    (_, i) => list.slice(i * sz, i * sz + sz)
  );
}

/exe @flat(arr) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][flat] raw arr:', arr);
  console.log('[issue-435][flat] normalized list:', list);
  return list.flat();
}

/exe @getIdentifiers(arr) = js {
  const list = arr && typeof arr === 'object' && arr.data !== undefined ? arr.data : arr;
  console.log('[issue-435][getIdentifiers] raw arr:', arr);
  console.log('[issue-435][getIdentifiers] normalized list:', list);
  return list.map((entry) => {
    const unwrapped = entry && typeof entry === 'object' && entry.data !== undefined ? entry.data : entry;
    console.log('[issue-435][getIdentifiers] entry normalized:', { entry, unwrapped });
    return unwrapped.file * unwrapped.file;
  });
}

/var @dataTmp = '[{"file": 1}, {"file": 2}, {"file": 3}, {"file": 4, "breaks":"a\na\na"}, {"file": 5} ]' | @json
/var @data = @onlySome(@dataTmp) | @truncateTo(4)
/var @idsTmp = run { echo @dataTmp } | @onlySome | @truncateTo(4) | @chunk(2)
/var @idsTmp2 = foreach @getIdentifiers(@idsTmp)
/var @ids = @idsTmp2 | @flat
/var @ages = '[30, 25, 1, 2]' | @json
/var @names = '["Alice", "Bob", "Carol", "Dave"]' | @json
/var @result = @zipAs(@data, @ids, "id") | @zipAs(@ages, "age") | @zipAs(@names, "name")
/show @result
