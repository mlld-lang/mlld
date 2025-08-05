---
description: Exe directive with for expression
---

>> Basic exe with for expression
/exe @upper(text) = js { return text.toUpperCase(); }
/exe @processItems(list) = for @item in @list => @upper(@item)

/var @fruits = ["apple", "banana", "cherry"]
/var @result = @processItems(@fruits)
/show @result

>> Exe with for expression using templates
/exe @greet(name) = `Hello, @name!`
/exe @greetAll(names) = for @name in @names => @greet(@name)

/var @people = ["Alice", "Bob", "Charlie"]
/var @greetings = @greetAll(@people)
/show @greetings

>> Exe with for expression on objects
/exe @formatEntry(key, value) = `@key: @value`
/exe @formatObject(obj) = for @val in @obj => @formatEntry(@val_key, @val)

/var @config = {"host": "localhost", "port": 3000, "ssl": true}
/var @formatted = @formatObject(@config)
/show @formatted