---
description: For loop with empty array
---

/var @empty = []
/for @item in @empty => /show `Item: @item`
/var @results = for @x in @empty => @x
/show @results