---
description: /exe RHS defined as foreach expression
---

/exe @wrap(x) = `[@x]`
/exe @processAll(items) = foreach @wrap(@items)

/show @processAll(["a", "b"])

