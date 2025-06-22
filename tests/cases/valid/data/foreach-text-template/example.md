# Test: foreach with text templates

/data @names = ["Alice", "Bob", "Charlie"]
/data @greetings = ["Hello", "Hi", "Hey"]

/exec @greeting(name) = [[{{name}}, welcome to the team!]]
/exec @custom_greeting(greet, name) = [[{{greet}}, {{name}}! Nice to see you.]]

# Single parameter text template
/data @welcomes = foreach @greeting(@names)
/add @welcomes

---

# Multiple parameter text template  
/data @custom_welcomes = foreach @custom_greeting(@greetings, @names)
/add @custom_welcomes