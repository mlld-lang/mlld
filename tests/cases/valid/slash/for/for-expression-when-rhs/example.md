---
description: for expression with when in RHS
---

/var @xs = [1, null, 2, null, 3]
/var @filtered = for @x in @xs => when [
  @x != null => @x
]

/show @filtered

