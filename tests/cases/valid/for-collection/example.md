---
description: For loop collecting results
---

/var @names = ["Alice", "Bob"]
/exe @greet(name) = `Hello, @name!`
/var @greetings = for @name in @names => @greet(@name)
/show @greetings