# Test Variables Are Not Re-interpreted

This tests that variable values containing mlld syntax are treated as literals.

/var @foo = 'bar'
/run {echo 'hello'}
/show @foo
[some/path.md]
Hello {{name}}