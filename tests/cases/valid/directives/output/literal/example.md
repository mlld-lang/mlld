# Test Output Directive - Literal Output

/var @content1 = "This is literal text content"
/var @content2 = "Line 1\nLine 2\nLine 3"

/output @content1 to "literal.txt"
/output @content2 to "multiline.txt"

The main document continues.