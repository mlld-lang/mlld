# Test: foreach with text templates

/var @names = ["Alice", "Bob", "Charlie"]
/var @greetings = ["Hello", "Hi", "Hey"]

/exe @greeting(name) = [[{{name}}, welcome to the team!]]
/exe @custom_greeting(greet, name) = [[{{greet}}, {{name}}! Nice to see you.]]

# Single parameter text template
/var @welcomes = foreach @greeting(@names)
/show @welcomes

---

# Multiple parameter text template  
/var @custom_welcomes = foreach @custom_greeting(@greetings, @names)
/show @custom_welcomes