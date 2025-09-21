---
description: Run command in for loop actions
---

# For Loop with Run Command

/var @messages = ["hello", "world", "test"]
/var @echoed = for @msg in @messages => run {echo "@msg"}
/show @echoed