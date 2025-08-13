---
description: Single pipeline operator in for loop actions
---

# For Loop with Pipeline

/exe @upper(str) = js { return str.toUpperCase() }

/var @names = ["alice", "bob", "charlie"]
/var @uppercased = for @name in @names => @name | @upper
/show @uppercased