# Pipeline with Executable Transform

This test ensures executable functions work correctly in pipeline expressions.
Regression test for GitHub issue #318.

/exe @uppercase(text) = run {echo "@text" | tr '[:lower:]' '[:upper:]'}
/exe @prefix(text) = run {echo "PREFIX: @text"}
/exe @suffix(text) = run {echo "@text SUFFIX"}

## Single Transform

/var @result1 = "hello world" | @uppercase
/show @result1

## Chained Transforms (Direct Pipe)

/var @result2 = "test"|@uppercase|@prefix|@suffix
/show @result2

## Chained Transforms (Array Syntax)

/var @result2b = "test" with { pipeline: [@uppercase, @prefix, @suffix] }
/show @result2b

## Transform with Variable Input

/var @message = "pipeline test"
/var @result3 = @message | @uppercase
/show @result3

## Complex Pipeline

/var @data = "important data"
/var @result4 = @data|@uppercase|@prefix
/show @result4