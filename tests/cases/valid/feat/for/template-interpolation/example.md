---
description: Template literal interpolation in for loop actions
---

# For Loop with Template Interpolation

/var @names = ["Alice", "Bob", "Charlie"]
/var @greetings = for @name in @names => `Hello, @name!`
/show @greetings