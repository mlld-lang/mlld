---
description: Reject when first modifier in when expression
---

/exe @grade(score) = when first [
  @score >= 90 => "A"
  * => "F"
]
