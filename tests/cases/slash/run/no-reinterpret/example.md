# Test Variables Are Not Re-interpreted

This tests that variable values containing mlld syntax are treated as literals.

/var @mlld_content = `/text @foo = 'bar'
/run {echo 'hello'}
/add @foo`

/var @path_content = '<some/path.md>'
/var @template_content = "Hello {{name}}"

>> Variable containing mlld directives should be literal
/run {echo "@mlld_content"}

>> Variable containing path syntax should be literal
/run {echo "@path_content"}

>> Variable containing template syntax should be literal
/run {echo "@template_content"}