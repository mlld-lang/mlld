/exe @onlySome(array) = for @item in @array => when [
    @item.file < 3 => @item
    none => skip
  ]

/var @data = '[{"file": 1}, {"file": 2}, {"file": 3, "breaks":"a\na\na"}]' | @json
/var @result = run { echo @data } | @onlySome
/show @result
