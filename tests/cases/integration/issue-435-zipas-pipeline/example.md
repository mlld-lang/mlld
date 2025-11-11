/exe @zipAs(entries,values,fieldName) = js {
  console.log('[issue-435][zipAs] raw entries:', entries);
  console.log('[issue-435][zipAs] raw values:', values);
  return entries.map((entry, i) => {
    const obj = {...entry}
    obj[fieldName] = values[i];
    console.log('[issue-435][zipAs] iteration', i, {
      entry,
      incomingValue: values[i],
      fieldName
    });
    return obj;
  });
}

/exe @onlySome(array) = for @item in @array => when [
    @item.file < 5 => @item
    none => skip
  ]

/exe @getIdentifiers(arr) = js {
  console.log('[issue-435][getIdentifiers] raw arr:', arr);
  return arr.map((entry, i) => {
    console.log('[issue-435][getIdentifiers] entry', i, entry);
    return entry.file * entry.file
  });
}

/var @dataTmp = '[{"file": 1}, {"file": 2}, {"file": 3}, {"file": 4, "breaks":"a\na\na"}, {"file": 5} ]' | @json
/var @data = @onlySome(@dataTmp)
/var @ages = '[30, 25, 1, 2]' | @json
/var @names = '["Alice", "Bob", "Carol", "Dave"]' | @json
/var @ids = @getIdentifiers(@data)
/var @result = @zipAs(@data, @ids, "id") | @zipAs(@ages, "age") | @zipAs(@names, "name")
/show @result
