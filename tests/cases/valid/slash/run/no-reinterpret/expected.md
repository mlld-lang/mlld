# Test Variables Are Not Re-interpreted

This tests that variable values containing mlld syntax are treated as literals.

/text @foo = 'bar'
/run {echo 'hello'}
/add @foo
<some/path.md>
Hello {{name}}