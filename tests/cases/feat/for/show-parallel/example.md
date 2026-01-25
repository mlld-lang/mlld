---
description: Show works inside parallel for-expression blocks
---

# Show in parallel for-expression

/var @items = ["a", "b", "c"]
/var @results = for parallel(2) @item in @items [
  show `Parallel: @item`
  => @item
]
/show `Done: @results.length items`
