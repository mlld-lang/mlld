---
description: Nested function calls in for loop actions
---

# For Loop with Nested Function Calls

/exe @greet(name) = `Hello, @name`
/exe @exclaim(str) = `@str!`
/exe @greetWithExclaim(name) = @exclaim(@greet(@name))

/var @names = ["Alice", "Bob"]
/var @greetings = for @name in @names => @greetWithExclaim(@name)
/show @greetings