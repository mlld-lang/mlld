---
description: /var assignment with bound-value when (first match semantics)
---

/var @x = 5
/var @res = when @x [
  >= 0 => "A"
  >= 3 => "B"
  < 10 => "C"
]

/show @res

