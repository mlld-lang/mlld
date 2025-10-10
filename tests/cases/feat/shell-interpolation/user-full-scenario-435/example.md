# Test: Full User Scenario from Issue #435

>> Complete reproduction of the user's reported issue
>> This is the end-to-end test that should pass after fixes

/exe @truncate_to(arr,max) = js {
  return arr.slice(0, max);
}

/exe @chunk(arr,sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @echo(e) = run { echo @e }

/exe @get_identifiers(e) = @echo(@e) | @echo

/var @data = '[[{"id": 1}, {"id": 2}], [30, 25], ["Alice", "Bob"]]'
/var @entries = run { echo @data } | @truncate_to(4) | @chunk(2)

/var @gi = foreach @get_identifiers(@entries)
/show @gi
