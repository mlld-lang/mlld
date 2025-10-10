/exe @onlySome(array) = for @item in @array => when [
    @item.file < 5 => @item
    none => skip
  ]

/exe @truncateTo(arr,max) = js {
  return arr.slice(0, max);
}

/var @dataTmp = '[{"file": 1}, {"file": 2}, {"file": 3}, {"file": 4}, {"file": 5}]' | @json
/var @result = run { echo @dataTmp } | @onlySome | @truncateTo(3)
/show @result
