# When Directive with @add Exec Invocation

Test that @when actions can use @add with exec command invocations.

@exec formatHeader(title) = [(echo "=== @title ===")]
@exec getVersion() = [[v1.2.3]]

@text showHeader = "true"

@when @showHeader => @add @formatHeader("Welcome")

@when true => @add "Current version: "
@when true => @add @getVersion()

@when true: [
  "dev" => @add @formatHeader("Development Mode")
  "prod" => @add @formatHeader("Production Mode")
  true => @add @formatHeader("Default Mode")
]