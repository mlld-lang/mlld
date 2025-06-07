# Output with Parameterized Text Template

@text greet(name,title) = @add [[## {{title}}

Hello, {{name}}! Welcome to mlld.]]

@output @greet("Alice","Greeting") [greeting.txt]
@output @greet("Bob","Welcome") [welcome.txt]