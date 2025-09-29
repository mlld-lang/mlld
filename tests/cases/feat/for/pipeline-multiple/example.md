---
description: Multiple pipeline operators in for loop actions
---

# For Loop with Multiple Pipelines

/exe @upper(str) = js { return str.toUpperCase() }
/exe @addExclaim(str) = js { return str + "!" }
/exe @wrap(str) = js { return "[" + str + "]" }

/var @names = ["alice", "bob"]
/var @transformed = for @name in @names => @name | @upper | @addExclaim | @wrap
/show @transformed