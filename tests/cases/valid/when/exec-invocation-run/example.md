# When Directive with @run Exec Invocation

Test that @when actions can use @run with exec command invocations.

@exec greet(name) = @run [(echo "Hello, @name!")]
@exec capitalize(text) = @run [(echo "@text" | tr '[:lower:]' '[:upper:]')]

@text condition = "true"

@when @condition => @run @greet("World")

@when true => @run @capitalize("test message")