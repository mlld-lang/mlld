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

/exe @onlySome(array) = for @item in @array => when [
    @item.file < 5 => @item
    none => skip
  ]

/exe @truncateTo(arr, max) = js {
  console.log('[issue-435][truncateTo] arr:', arr);
  console.log('[issue-435][truncateTo] max:', max);
  return arr.slice(0, max);
}

/exe @chunk(arr, sz) = js {
  console.log('[issue-435][chunk] arr:', arr);
  console.log('[issue-435][chunk] size:', sz);
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @flat(arr) = js {
  console.log('[issue-435][flat] arr:', arr);
  return arr.flat();
}

/exe @getIdentifiers(arr) = js {
  console.log('[issue-435][getIdentifiers] arr:', arr);
  return arr.map((entry) => {
    console.log('[issue-435][getIdentifiers] entry:', entry);
    return entry.file * entry.file;
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
