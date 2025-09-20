---
description: /show foreach with cartesian product over two arrays
---

/var @names = ["A","B"]
/var @nums = [1,2]
/exe @pair(a,b) = `@a-@b`
/show foreach @pair(@names,@nums)

