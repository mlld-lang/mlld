# Test Inline Comments

This tests that inline comments at the end of directives are properly handled.

@text greeting = "Hello World" >> This sets up our greeting
@data config = { "debug": true } << Configuration object

@import { x, y } from "./utils.mld" << Import some utilities

@exec sayHello(name) = [(echo "Hello, {{name}}!")] >> Parameterized command

@run [(echo "@greeting")] << Output the greeting

@path docs = "./documentation" >> Path to docs folder

@add [README.md] << Include the readme file