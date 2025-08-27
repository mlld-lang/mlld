/var @greetings = ["Hello", "Hi", "Hey"]
/var @names = ["Alice", "Bob", "Charlie"]
/exe @custom_greeting(greet, name) = :::{{greet}}, {{name}}! Nice to see you.:::
/var @messages = foreach @custom_greeting(@greetings, @names)
/show @messages