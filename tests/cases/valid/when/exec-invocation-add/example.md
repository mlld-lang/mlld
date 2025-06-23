# When Directive with @add Exec Invocation

Test that @when actions can use @add with exec command invocations.

/var @isTrue = true
/exe @formatHeader(title) = {echo "=== @title ==="}
/exe @getVersion() = [[v1.2.3]]

/var @showHeader = "true"

/when @showHeader => @add @formatHeader("Welcome")

/when @isTrue => @add "Current version: "
/when @isTrue => @add @getVersion()

/when @isTrue first: [
  "dev" => @add @formatHeader("Development Mode")
  "prod" => @add @formatHeader("Production Mode")
  @isTrue => @add @formatHeader("Default Mode")
]