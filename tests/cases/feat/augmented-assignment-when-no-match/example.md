>> when expressions return null on no-match. += null/undefined against an
>> array must be a no-op so partition idioms don't smear nulls into buckets.

/var @results = [
  { "name": "a", "ok": true },
  { "name": "b", "ok": false },
  { "name": "c", "ok": true }
]

/var @passes = []
/var @fails = []
/for @r in @results [
  let @passes += when [ @r.ok => [@r] ]
  let @fails  += when [ !@r.ok => [@r] ]
]

/show `passes: @passes.length, fails: @fails.length`
/show @passes | @json
/show @fails | @json
