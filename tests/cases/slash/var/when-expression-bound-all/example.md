---
description: /var assignment with when first (first match semantics)
---

/var @x = 5
/var @res = when first [
  @x >= 0 => "A"
  @x >= 3 => "B"
  @x < 10 => "C"
]

/show @res

