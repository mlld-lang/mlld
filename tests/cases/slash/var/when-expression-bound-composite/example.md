---
description: /var assignment with bound-value when and composite patterns
---

/var @score = 0.5
/var @tier = when @score [
  >= 0.7 => "REQUIRED"
  >= 0.3 && < 0.7 => "OPTIONAL"
  * => "SKIP"
]

/show @tier

