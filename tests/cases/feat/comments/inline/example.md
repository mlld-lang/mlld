# Test Inline Comments

This tests that inline comments at the end of directives are properly handled.

>> Line start comment with >>
<< Line start comment with <<

/var @greeting = "Hello World" >> This sets up our greeting
/var @config = { "debug": true } << Configuration object with << marker
/var @username = "Test" >> Another variable with >> comment
/var @version = "1.0" << Version with << comment

/import { x, y } from "./inline-test-utils.mld" >> Import some utilities

/exe @sayHello(name) = cmd {echo "Hello, {{name}}!"} << Parameterized command

/run {echo "@greeting"} >> Output the greeting

/path @docs = "./documentation" << Path to docs folder

/show @greeting >> Show variable with >> comment
/show @config << Show with << comment
/show <inline-test-README.md> >> Include the readme file