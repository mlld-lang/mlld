# Test Variables Are Not Re-interpreted

This tests that variable values containing mlld syntax are treated as literals.

/text @mlld_content = '/text @foo = \'bar\'\n/run {echo \'hello\'}\n/add @foo'

/text @path_content = "[some/path.md]"
/text @template_content = "Hello {{name}}"

// Variable containing mlld directives should be literal
/run {echo "@mlld_content"}

// Variable containing path syntax should be literal
/run {echo "@path_content"}

// Variable containing template syntax should be literal
/run {echo "@template_content"}