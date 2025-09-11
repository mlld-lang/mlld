---
description: /show foreach with separator and template options
---

/var @nums = [1, 2, 3]
/exe @square(n) = js { return n * n }

/show foreach @square(@nums) with { separator: " | ", template: "{{index}}={{result}}" }
