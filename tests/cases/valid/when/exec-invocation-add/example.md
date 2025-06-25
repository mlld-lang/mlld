# When Directive with @add Exec Invocation

Test that @when actions can use @add with exec command invocations.

/var @isTrue = "true"
/exe @formatHeader(title) = run {echo "=== @title ==="}
/exe @getVersion() = `v1.2.3`

/var @showHeader = "true"

/when @showHeader => show @formatHeader("Welcome")

/when @isTrue => show "Current version: "
/when @isTrue => show @getVersion()

/when @isTrue first: [
  "dev" => show @formatHeader("Development Mode")
  "prod" => show @formatHeader("Production Mode")
  @isTrue => show @formatHeader("Default Mode")
]