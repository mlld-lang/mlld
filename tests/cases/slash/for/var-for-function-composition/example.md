---
description: Var directive with for expression and function composition
---

>> Create formatted greetings using for expression
/exe @makeGreeting(prefix) = `@prefix, World!`
/var @greetings = ["Hello", "Hi", "Hey"]
/var @results = for @greeting in @greetings => @makeGreeting(@greeting)

>> Show the first result
/var @firstGreeting = @results[0]
/show @firstGreeting

>> Map data through transformations
/exe @double(n) = js { return n * 2; }
/exe @addOne(n) = js { return n + 1; }
/exe @square(n) = js { return n * n; }

/var @operations = [@double, @addOne, @square]
/exe @applyAll(value, ops) = for @op in @ops => @op(@value)

/var @result = @applyAll(3, @operations)
/show @result