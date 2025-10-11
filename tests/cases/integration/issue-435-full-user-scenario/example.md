/exe @zipAs(entries,values,fieldName) = js {
  return entries.map((entry, i) => {
    const obj = {...entry}
    obj[fieldName] = values[i];
    return obj;
  });
}

/exe @onlySome(array) = for @item in @array => when [
    @item.file < 5 => @item
    none => skip
  ]

/exe @truncateTo(arr,max) = js {
  return arr.slice(0, max);
}

/exe @chunk(arr,sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @flat(arr) = js {
  return arr.flat()
}

/exe @getIdentifiers(arr) = js {
  return arr.map((entry, i) => {
    return entry.file * entry.file
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
