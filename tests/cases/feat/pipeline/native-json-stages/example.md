>> Native mlld stage filters High findings
/exe @filterHigh(array) = for @item in @array => when [
  @item.finding.startsWith("High") => @item
  none => skip
]

>> Add flags via foreach and JS
/exe @addFlag(entry) = js {
  return { ...entry, flagged: true }
}
/exe @addFlagForeach(entries) = foreach @addFlag(@entries)

>> JS stage used after native filter
/exe @appendSuffix(entries) = js {
  return entries.map(e => ({ ...e, finding: `${e.finding}-OK` }))
}

/var @entries = '[{"finding":"High-1"},{"finding":"Low-1"},{"finding":"High-2"}]'

>> Native mlld stages should operate on parsed objects
/var @nativeResult = @entries | @filterHigh | @addFlagForeach | @json
/show @nativeResult

>> Chaining into JavaScript preserves parsed arrays
/var @jsResult = @entries | @filterHigh | @appendSuffix | @json
/show @jsResult
