---
description: /var assignment with bound-value when
---

/var @eval = { responseRequired: 0.8 }
/var @tier = when @eval.responseRequired [
  >= 0.7 => "REQUIRED"
  >= 0.3 => "OPTIONAL"
  * => "SKIP"
]

/show @tier

