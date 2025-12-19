---
description: /var assignment with bound-value when first
---

/var @eval = { responseRequired: 0.8 }
/var @tier = when @eval.responseRequired first [
  >= 0.7 => "REQUIRED"
  >= 0.3 => "OPTIONAL"
  * => "SKIP"
]

/show @tier

