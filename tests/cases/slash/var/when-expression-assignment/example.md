---
description: /var assignment with when expression
---

/var @score = 95
/var @status = when [
  @score > 90 => "A"
  * => "F"
]

/show @status

