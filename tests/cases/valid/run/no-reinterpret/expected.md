# Test Variables Are Not Re-interpreted

This tests that variable values containing mlld syntax are treated as literals.

>> Variable containing mlld directives should be literal
@text foo = 'bar'
@run [echo 'hello']
@add @foo

>> Variable containing path syntax should be literal
[some/path.md]

>> Variable containing template syntax should be literal
Hello {{name}}