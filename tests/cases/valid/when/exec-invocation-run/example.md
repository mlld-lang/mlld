# When Directive with run Exec Invocation

Test that @when actions can use run with exec command invocations.

/var @isTrue = true
/exe @greet(name) = {echo "Hello, @name!"}
/exe @capitalize(text) = {echo "@text" | tr '[:lower:]' '[:upper:]'}

/var @condition = "true"

/when @condition => run @greet("World")

/when @isTrue => run @capitalize("test message")