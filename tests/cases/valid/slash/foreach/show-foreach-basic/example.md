---
description: /show foreach with simple executable and array
---

/var @names = ["Ann", "Ben"]
/exe @wrap(name) = `Hello @name`
/show foreach @wrap(@names)

