# When Directive with @run Exec Invocation

Test that @when actions can use @run with exec command invocations.

@data isTrue = true
@exec greet(name) = [(echo "Hello, @name!")]
@exec capitalize(text) = [(echo "@text" | tr '[:lower:]' '[:upper:]')]

@text condition = "true"

@when @condition => @run @greet("World")

@when @isTrue => @run @capitalize("test message")