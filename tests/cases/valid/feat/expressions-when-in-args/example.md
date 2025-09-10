---
description: when expression used as function argument
---

/var @cond = true
/exe @fmt(x) = `val:@x`
/show @fmt(when [ @cond => "yes" * => "no" ])

