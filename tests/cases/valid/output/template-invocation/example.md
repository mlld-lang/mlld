# Output with Parameterized Text Template

/exe @greet(name,title) = ::## {{title}}

Hello, {{name}}! Welcome to mlld.::

/output @greet("Alice","Greeting") [greeting.txt]
/output @greet("Bob","Welcome") [welcome.txt]