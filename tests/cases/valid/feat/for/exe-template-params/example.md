---
description: Exe function with multiple parameters using template interpolation in for loop
---

# For Loop with Multi-Parameter Exe Template

/exe @makeGreeting(name, title) = `Dear @title @name, welcome!`

/var @people = [
  {"name": "Smith", "title": "Dr."},
  {"name": "Johnson", "title": "Prof."},
  {"name": "Williams", "title": "Ms."}
]

/var @greetings = for @person in @people => @makeGreeting(@person.name, @person.title)
/show @greetings