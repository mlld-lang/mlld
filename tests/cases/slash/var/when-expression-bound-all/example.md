---
description: /var assignment with bound-value when (all matching)
---

/var @x = 5
/var @res = when @x [
  >= 0 => "A"
  >= 3 => "B"
  < 10 => "C"
]

/show @res

