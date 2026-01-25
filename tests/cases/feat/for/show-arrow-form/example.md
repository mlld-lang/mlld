---
description: Show in arrow-form for-expression emits AND captures
---

# Show in arrow-form for-expression

/var @items = ["alpha", "beta"]
/var @results = for @item in @items => show `Item: @item`
/show `Captured: @results`
