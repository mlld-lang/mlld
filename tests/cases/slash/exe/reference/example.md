/exe @echo(text) = cmd {echo "@text"}
/exe @greet(name) = cmd {echo "Hello, @name!"}
/run @greet("World")
