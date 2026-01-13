# Test: Nested StructuredValue field access in for loop

When a StructuredValue (loaded JSON) is nested inside an object and iterated,
field access should still work - even when the StructuredValue Symbol is lost.

/var @jsonData = <nested-sv-test-data.json>

## Direct access works
/show `Direct topic: @jsonData.topic`

## Wrapped in object - direct access works
/var @wrapped = { sv: @jsonData }
/show `Wrapped direct: @wrapped.sv.topic`

## Wrapped in object inside for loop
/var @items = [{ name: "item1", sv: @jsonData }]

/for @item in @items [
  show `In loop name: @item.name`
  show `In loop sv.topic: @item.sv.topic`
  show `In loop nested: @item.sv.details.status`
  let @sv = @item.sv
  show `Let var topic: @sv.topic`
]
