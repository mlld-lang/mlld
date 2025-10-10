# Test: User Scenario from Issue #435

>> This is the exact user scenario that revealed the bug
>> Simplified version focusing on the core issue

/exe @chunk(arr, sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}

/exe @echo(e) = run { echo @e }

/exe @get_identifiers(e) = @echo(@e) | @echo

/var @data = '[[{"id": 1}, {"id": 2}], [30, 25], ["Alice", "Bob"]]'
/var @parsed = @data | @json
/var @chunks = @chunk(@parsed, 2)

>> Test each chunk individually
/var @chunk1 = @chunks[0]
/show @echo(@chunk1)

/var @chunk2 = @chunks[1]
/show @echo(@chunk2)
