# Test Explicit Module Export

This tests a module with explicit /export directive.

/import "./explicit-export-test-module.mld" as @utils
/show `Greeting: @utils.greet("World")`
