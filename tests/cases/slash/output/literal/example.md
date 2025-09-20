# Test Output Directive - Literal Output

/var @content1 = "This is literal text content"
/var @content2 = "Line 1\nLine 2\nLine 3"

/output @content1 to "literal.txt"
/output @content2 to "multiline.txt"

>> Regression test for issue #354: Double-quoted strings with interpolation
/var @name = "Alice"
/var @greeting = "Hello"
/output "@greeting, @name!" to "interpolated-double.txt"

>> Regression test for issue #353: Backtick template support
/var @time = "morning"
/output `Good @time, @name!` to "interpolated-backtick.txt"

>> Also test other template types
/output ::Welcome @name:: to "interpolated-colon.txt"
/output 'No interpolation: @name' to "literal-single.txt"

The main document continues.