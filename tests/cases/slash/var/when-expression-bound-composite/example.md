---
description: /var assignment with bound-value when first and composite patterns
---

/var @score = 0.5
/var @tier = when @score first [
  >= 0.7 => "REQUIRED"
  >= 0.3 && < 0.7 => "OPTIONAL"
  * => "SKIP"
]

/show @tier

