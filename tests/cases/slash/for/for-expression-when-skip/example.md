---
description: for expression with when skip to filter out non-matches
---

/var @xs = [1, null, 2, null, 3]
/var @filtered = for @x in @xs => when [
  @x != null => @x
  none => skip
]

/show @filtered
