# Test: Nested field access when iterating over JSON array file

JSON files containing arrays should iterate over the array elements,
and nested field access should work on each element.

/var @data = <test-data.json>

## Block syntax with nested access
/for @item in @data [
  show `@item.name: @item.profile.city`
]

## Arrow syntax with nested access
/var @cities = for @p in @data => @p.profile.city
/show `Cities: @cities`

## Deeply nested access
/var @ages = for @p in @data => @p.profile.age
/show `Ages: @ages`
