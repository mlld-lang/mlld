---
description: Show in block-form for-expression emits AND captures result
---

# Show in block-form for-expression

/var @items = ["x", "y"]
/var @results = for @item in @items [
  show `Processing: @item`
  => `done-@item`
]
/show `Results: @results`
