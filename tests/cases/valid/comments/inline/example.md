# Test Inline Comments

This tests that inline comments at the end of directives are properly handled.

/var @greeting = "Hello World" >> This sets up our greeting
/var @config = { "debug": true } >> Configuration object

/import { x, y } from "./utils.mld" >> Import some utilities

/exe @sayHello(name) = {echo "Hello, {{name}}!"} >> Parameterized command

/run {echo "@greeting"} >> Output the greeting

/path @docs = "./documentation" >> Path to docs folder

/show [README.md] >> Include the readme file