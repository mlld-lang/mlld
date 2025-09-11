---
description: /var assignment with foreach result (array)
---

/var @names = ["Ann","Ben"]
/exe @wrap(n) = `(@n)`
/var @wrapped = foreach @wrap(@names)
/show @wrapped

