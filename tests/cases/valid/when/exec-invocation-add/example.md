# When Directive with @add Exec Invocation

Test that @when actions can use @add with exec command invocations.

/data @isTrue = true
/exec @formatHeader(title) = {echo "=== @title ==="}
/exec @getVersion() = [[v1.2.3]]

/text @showHeader = "true"

/when @showHeader => @add @formatHeader("Welcome")

/when @isTrue => @add "Current version: "
/when @isTrue => @add @getVersion()

/when @isTrue first: [
  "dev" => @add @formatHeader("Development Mode")
  "prod" => @add @formatHeader("Production Mode")
  @isTrue => @add @formatHeader("Default Mode")
]